use super::AgentJobStore;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
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

/// How to drive one CLI agent headlessly. Every entry takes its prompt on stdin
/// (see run_agent_job) so it never hits arg-length limits.
struct AgentCli {
    /// Shell invocation that puts the CLI into non-interactive, auto-approving
    /// mode. The prompt is NOT part of it — it arrives on stdin.
    command: &'static str,
    /// Flag that injects the autonomy rules as a system prompt. `None` means the
    /// CLI has no such flag, so the rules are prepended to the prompt instead.
    system_prompt_flag: Option<&'static str>,
    /// Supports Claude-style `--output-format stream-json --verbose`.
    stream_json: bool,
}

/// Registry of supported agents. Adding a CLI is a row here plus an entry in the
/// frontend's CLI list — nothing else in the job pipeline is agent-specific.
///
/// Anything unknown falls through to Claude Code, which is what the previous
/// single-agent implementation did.
fn agent_cli(cli: &str) -> AgentCli {
    match cli {
        // opencode has no system-prompt flag — autonomy rules go in the prompt.
        "opencode" => AgentCli {
            command: "opencode run",
            system_prompt_flag: None,
            stream_json: false,
        },
        // `codex exec` is the non-interactive mode; --full-auto lets it edit
        // files and run commands without asking.
        "codex" => AgentCli {
            command: "codex exec --full-auto",
            system_prompt_flag: None,
            stream_json: false,
        },
        // --yolo is Gemini CLI's auto-approve; it reads the prompt from stdin.
        "gemini" => AgentCli {
            command: "gemini --yolo",
            system_prompt_flag: None,
            stream_json: false,
        },
        // -p = print/headless, --force skips per-action approval.
        "cursor-agent" => AgentCli {
            command: "cursor-agent -p --force",
            system_prompt_flag: None,
            stream_json: false,
        },
        // -x is Amp's execute-and-exit mode.
        "amp" => AgentCli {
            command: "amp -x",
            system_prompt_flag: None,
            stream_json: false,
        },
        // -p / --print = headless; `--permission-mode auto` is the Shift+Tab
        // "auto mode" — its classifier auto-approves safe actions. Note: auto
        // still defers actions it deems risky to a human, so a job may stall on
        // those in headless; the AUTONOMY_PROMPT (never ask, make assumptions,
        // apply changes directly) pushes Claude to power through. Requires a
        // claude version that lists `auto` under --permission-mode.
        _ => AgentCli {
            command: "claude -p --permission-mode auto",
            system_prompt_flag: Some("--append-system-prompt"),
            stream_json: true,
        },
    }
}

/// Append a single output line to a job's on-disk log, if logging is enabled.
/// Best-effort — a failed write never interrupts the live stream.
fn append_log(log: &Option<Arc<Mutex<File>>>, line: &str) {
    if let Some(handle) = log {
        if let Ok(mut file) = handle.lock() {
            let _ = writeln!(file, "{}", line);
        }
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
    log_path: Option<String>,
    stream_json: Option<bool>,
) -> Result<(), String> {
    let agent = agent_cli(&cli);
    let mut command = match agent.system_prompt_flag {
        Some(flag) => format!("{} {} '{}'", agent.command, flag, AUTONOMY_PROMPT),
        None => agent.command.to_string(),
    };
    // Plain `claude -p` prints nothing until the run finishes, which leaves a
    // caller with no idea whether a four-minute job is working or wedged.
    // stream-json emits one NDJSON event per message, tool call and hook, so the
    // frontend can show live activity. `--verbose` is required alongside it in
    // headless mode. CLIs without an equivalent keep plain output.
    if stream_json.unwrap_or(false) && agent.stream_json {
        command.push_str(" --output-format stream-json --verbose");
    }

    // Persist the full output stream to disk so it survives the in-memory ring
    // buffer cap and a webview reload — the run report and reattach both read it.
    let log_file = log_path.as_deref().and_then(|p| {
        if let Some(parent) = Path::new(p).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(p)
            .ok()
            .map(|f| Arc::new(Mutex::new(f)))
    });
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    // CLIs without a system-prompt flag get the autonomy rules folded into the
    // prompt itself; the rest already carry them on the command line above.
    let prompt = if agent.system_prompt_flag.is_none() {
        format!("{}\n\n{}", AUTONOMY_PROMPT, prompt)
    } else {
        prompt
    };

    let mut cmd = Command::new(&shell);
    cmd.args(["-lc", &command])
        .current_dir(&cwd)
        .env("TERM", "xterm-256color")
        // No human is attached to this job, so make sure nothing the agent runs
        // can block waiting for interactive input. These stop the most common
        // culprits: git credential/host prompts, interactive pagers, and tools
        // that only go non-interactive when they detect a CI environment.
        .env("GIT_TERMINAL_PROMPT", "0") // git never prompts for username/password
        .env("GIT_ASKPASS", "true")      // no credential-helper GUI/tty popup
        .env("SSH_ASKPASS", "true")      // ssh won't pop a passphrase prompt
        .env("GIT_PAGER", "cat")         // git output isn't piped into a pager
        .env("PAGER", "cat")             // ditto for anything else that pages
        .env("CI", "1")                  // many CLIs suppress prompts when CI is set
        .env("DEBIAN_FRONTEND", "noninteractive")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Own process group so cancel_agent_job can kill the whole tree. Unix only:
    // `process_group` comes from the unix CommandExt, and the group-kill in
    // cancel_agent_job is likewise POSIX. On Windows this is a no-op.
    #[cfg(unix)]
    cmd.process_group(0);
    let mut child = cmd
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
        let log = log_file.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                append_log(&log, &line);
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
        let log = log_file.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                append_log(&log, &line);
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

    // Escalate to SIGKILL for an agent that ignores SIGTERM, so a job can never
    // get stuck in a half-cancelled state. Harmless if the group already exited.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{}", pid)])
            .status();
    });

    if let Ok(mut jobs) = store.jobs.lock() {
        jobs.remove(&job_id);
    }

    Ok(killed)
}

/// Return the ids of jobs still tracked as running in this process. The frontend
/// uses this on startup to tell a live job (backend still streaming after a
/// webview reload) apart from one orphaned by a full app restart.
#[tauri::command]
pub fn list_running_agent_jobs(
    store: tauri::State<Arc<AgentJobStore>>,
) -> Result<Vec<String>, String> {
    let jobs = store
        .jobs
        .lock()
        .map_err(|e| format!("Failed to lock job store: {}", e))?;
    Ok(jobs.keys().cloned().collect())
}
