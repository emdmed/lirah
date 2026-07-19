use super::AgentJobStore;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(serde::Serialize, Clone)]
struct JobOutput {
    #[serde(rename = "jobId")]
    job_id: String,
    stream: String,
    chunk: String,
}

#[derive(serde::Serialize, Clone)]
struct JobDone {
    #[serde(rename = "jobId")]
    job_id: String,
    #[serde(rename = "exitCode")]
    exit_code: i32,
    success: bool,
}

/// Steers headless jobs to run without a human in the loop. Kept free of single
/// quotes so it can be embedded in a single-quoted shell argument.
const AUTONOMY_PROMPT: &str = "You are running as an autonomous, non-interactive background job. \
No human is available to answer questions or approve steps. Never ask for confirmation or \
clarification, and never end your turn with a question. Make reasonable assumptions, state them \
briefly, and complete the entire task. Apply all code changes directly to the files. When \
finished, end with a short summary of what you changed and why.";

/// Build the headless CLI invocation for a given agent. The prompt is passed via
/// stdin (see run_agent_job) so it never hits arg-length limits. Flags put each
/// CLI into non-interactive, auto-approving mode so jobs run unattended.
fn build_command(cli: &str) -> String {
    match cli {
        // opencode has no system-prompt flag — its autonomy rules are prepended
        // to the prompt in run_agent_job instead.
        "opencode" => "opencode run".to_string(),
        // -p / --print = headless; `--permission-mode auto` lets Claude decide
        // permissions itself so the job runs unattended (needs claude >= 2.1).
        // --append-system-prompt injects the autonomy rules as a system prompt.
        _ => format!(
            "claude -p --permission-mode auto --append-system-prompt '{}'",
            AUTONOMY_PROMPT
        ),
    }
}

/// Spawn a background agent job. Returns immediately; output is streamed to the
/// frontend via `agent-job://output` events and completion via `agent-job://done`.
/// The job runs headless in `cwd` (typically an isolated git worktree).
#[tauri::command]
pub fn run_agent_job(
    app_handle: AppHandle,
    store: tauri::State<Arc<AgentJobStore>>,
    job_id: String,
    cli: String,
    prompt: String,
    cwd: String,
) -> Result<(), String> {
    let command = build_command(&cli);
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    // opencode can't take a system prompt via flag, so fold the autonomy rules
    // into the prompt itself. Claude gets them via --append-system-prompt.
    let prompt = if cli == "opencode" {
        format!("{}\n\n{}", AUTONOMY_PROMPT, prompt)
    } else {
        prompt
    };

    let mut child = Command::new(&shell)
        .args(["-lc", &command])
        .current_dir(&cwd)
        .env("TERM", "xterm-256color")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Own process group so cancel_agent_job can kill the whole tree.
        .process_group(0)
        .spawn()
        .map_err(|e| format!("Failed to spawn agent job: {}", e))?;

    // Feed the prompt via stdin, then close it so the CLI starts working.
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|e| format!("Failed to write prompt to stdin: {}", e))?;
        // Dropping stdin (end of scope) sends EOF.
        let _ = stdin.flush();
    }

    let pid = child.id();
    store
        .jobs
        .lock()
        .map_err(|e| format!("Failed to lock job store: {}", e))?
        .insert(job_id.clone(), pid);

    // Stream stdout line-by-line.
    if let Some(stdout) = child.stdout.take() {
        let app = app_handle.clone();
        let id = job_id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app.emit(
                    "agent-job://output",
                    JobOutput {
                        job_id: id.clone(),
                        stream: "stdout".to_string(),
                        chunk: line,
                    },
                );
            }
        });
    }

    // Stream stderr line-by-line.
    if let Some(stderr) = child.stderr.take() {
        let app = app_handle.clone();
        let id = job_id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app.emit(
                    "agent-job://output",
                    JobOutput {
                        job_id: id.clone(),
                        stream: "stderr".to_string(),
                        chunk: line,
                    },
                );
            }
        });
    }

    // Wait for completion in a background thread, then emit done + clean up.
    let app = app_handle.clone();
    let store_inner = store.inner().clone();
    let id = job_id.clone();
    std::thread::spawn(move || {
        let exit_code = match child.wait() {
            Ok(status) => status.code().unwrap_or(-1),
            Err(_) => -1,
        };
        if let Ok(mut jobs) = store_inner.jobs.lock() {
            jobs.remove(&id);
        }
        let _ = app.emit(
            "agent-job://done",
            JobDone {
                job_id: id,
                exit_code,
                success: exit_code == 0,
            },
        );
    });

    Ok(())
}

/// Cancel a running agent job by killing its process group (SIGTERM).
#[tauri::command]
pub fn cancel_agent_job(
    store: tauri::State<Arc<AgentJobStore>>,
    job_id: String,
) -> Result<bool, String> {
    let pid = {
        let jobs = store
            .jobs
            .lock()
            .map_err(|e| format!("Failed to lock job store: {}", e))?;
        jobs.get(&job_id).copied()
    };

    let Some(pid) = pid else {
        return Ok(false);
    };

    // Negative pid targets the whole process group (see process_group(0) above).
    let killed = Command::new("kill")
        .args(["-TERM", &format!("-{}", pid)])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if let Ok(mut jobs) = store.jobs.lock() {
        jobs.remove(&job_id);
    }

    Ok(killed)
}
