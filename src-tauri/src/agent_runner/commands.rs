use super::AgentJobStore;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(serde::Serialize, Clone)]
struct JobLine {
    stream: String,
    chunk: String,
}

#[derive(serde::Serialize, Clone)]
struct JobOutput {
    #[serde(rename = "jobId")]
    job_id: String,
    lines: Vec<JobLine>,
}

/// Flush buffered job output at most this often. Slower than the PTY's 8ms —
/// nobody types into a headless job, so the only cost of waiting is how fresh
/// the log panel looks.
const JOB_FLUSH_INTERVAL: Duration = Duration::from_millis(60);
/// Flush early once this many lines accumulate, so a burst keeps moving.
const JOB_FLUSH_LINES: usize = 200;

/// Coalesce a job's output before it crosses the Rust→JS IPC boundary.
///
/// Emitting one event per line meant a chatty agent (or `--output-format
/// stream-json`, which prints an event per message, tool call and hook) drove
/// hundreds of React state updates a second, each re-rendering the whole jobs
/// sidebar. This batches on the same principle as the PTY reader: block while
/// idle so a quiet job costs no wakeups, flush on line count or elapsed time.
///
/// stdout and stderr feed one channel so their interleaving is preserved; each
/// line keeps its own stream tag inside the batch.
fn batch_job_output(rx: Receiver<JobLine>, app: AppHandle, job_id: String) {
    let mut pending: Vec<JobLine> = Vec::new();
    // Some(_) once lines are buffered: the instant by which we must flush.
    let mut deadline: Option<Instant> = None;
    let emit = |lines: Vec<JobLine>| {
        let _ = app.emit(
            "agent-job://output",
            JobOutput {
                job_id: job_id.clone(),
                lines,
            },
        );
    };
    loop {
        let next = match deadline {
            None => rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
            Some(dl) => match dl.checked_duration_since(Instant::now()) {
                Some(remaining) => rx.recv_timeout(remaining),
                None => Err(RecvTimeoutError::Timeout),
            },
        };
        match next {
            Ok(line) => {
                if pending.is_empty() {
                    deadline = Some(Instant::now() + JOB_FLUSH_INTERVAL);
                }
                pending.push(line);
                if pending.len() >= JOB_FLUSH_LINES {
                    deadline = None;
                    emit(std::mem::take(&mut pending));
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                if !pending.is_empty() {
                    deadline = None;
                    emit(std::mem::take(&mut pending));
                }
            }
            Err(RecvTimeoutError::Disconnected) => {
                if !pending.is_empty() {
                    emit(pending);
                }
                break;
            }
        }
    }
}

#[derive(serde::Serialize, Clone)]
struct JobDone {
    #[serde(rename = "jobId")]
    job_id: String,
    #[serde(rename = "exitCode")]
    exit_code: i32,
    success: bool,
    /// The watchdog killed it after it sat idle too long.
    #[serde(rename = "timedOut")]
    timed_out: bool,
}

#[derive(serde::Serialize, Clone)]
struct JobIdle {
    #[serde(rename = "jobId")]
    job_id: String,
    /// Seconds without output or CPU work; 0 once it is active again.
    #[serde(rename = "idleSecs")]
    idle_secs: u64,
}

/// How often the watchdog looks at a running job.
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(15);
/// Report a job as idle after this long with no output and no CPU work.
const IDLE_NOTICE_AFTER: Duration = Duration::from_secs(3 * 60);
/// Kill a job idle this long. Only enforced where CPU time can be sampled:
/// output alone can't tell a stuck job from `claude -p`, which prints nothing
/// until it finishes.
const IDLE_KILL_AFTER: Duration = Duration::from_secs(15 * 60);
/// CPU time (clock ticks, usually 10 ms each) a job must burn per watchdog
/// interval to count as working. An agent streaming a response stays well
/// above this; one blocked on a prompt nobody will answer stays below it.
const ACTIVE_CPU_TICKS: u64 = 5;

/// Total user+system CPU ticks of every process in process group `pgid`.
#[cfg(target_os = "linux")]
fn process_group_cpu_ticks(pgid: u32) -> Option<u64> {
    let entries = std::fs::read_dir("/proc").ok()?;
    let mut total = 0u64;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(pid) = name.to_str() else { continue };
        if !pid.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        let Ok(stat) = std::fs::read_to_string(format!("/proc/{}/stat", pid)) else {
            continue;
        };
        // The command name is parenthesised and may contain spaces; the fixed
        // fields start after the last ')'. Relative to that: [2] pgrp,
        // [11] utime, [12] stime.
        let Some(rest) = stat.rfind(')').map(|i| &stat[i + 1..]) else {
            continue;
        };
        let fields: Vec<&str> = rest.split_whitespace().collect();
        if fields.get(2).and_then(|g| g.parse::<u32>().ok()) != Some(pgid) {
            continue;
        }
        let utime: u64 = fields.get(11).and_then(|v| v.parse().ok()).unwrap_or(0);
        let stime: u64 = fields.get(12).and_then(|v| v.parse().ok()).unwrap_or(0);
        total += utime + stime;
    }
    Some(total)
}

#[cfg(not(target_os = "linux"))]
fn process_group_cpu_ticks(_pgid: u32) -> Option<u64> {
    None
}

/// SIGTERM a job's process group, then SIGKILL it if it is still there after
/// a few seconds.
fn kill_process_group(pid: u32) -> bool {
    let killed = Command::new("kill")
        .args(["-TERM", &format!("-{}", pid)])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{}", pid)])
            .status();
    });
    killed
}

/// Watch a running job for the case its spinner can't show: no output and no
/// CPU work, typically an agent blocked on an approval no one can give.
/// Reports idle spells as `agent-job://idle` and kills a job idle for
/// IDLE_KILL_AFTER. Returns when `stop` is dropped or signalled.
fn watch_job(
    app: AppHandle,
    job_id: String,
    pgid: u32,
    started: Instant,
    last_output_ms: Arc<AtomicU64>,
    timed_out: Arc<AtomicBool>,
    stop: Receiver<()>,
) {
    let mut last_ticks = process_group_cpu_ticks(pgid);
    let can_kill = last_ticks.is_some();
    let mut last_active = Instant::now();
    let mut reported_idle = false;
    let mut seen_output_ms = 0;
    loop {
        match stop.recv_timeout(WATCHDOG_INTERVAL) {
            Err(RecvTimeoutError::Timeout) => {}
            _ => return,
        }
        let output_ms = last_output_ms.load(Ordering::Relaxed);
        let ticks = process_group_cpu_ticks(pgid);
        let busy = match (last_ticks, ticks) {
            (Some(before), Some(now)) => now.saturating_sub(before) >= ACTIVE_CPU_TICKS,
            _ => false,
        };
        last_ticks = ticks;
        if output_ms != seen_output_ms || busy {
            seen_output_ms = output_ms;
            last_active = Instant::now();
            if reported_idle {
                reported_idle = false;
                let _ = app.emit(
                    "agent-job://idle",
                    JobIdle { job_id: job_id.clone(), idle_secs: 0 },
                );
            }
            continue;
        }
        let idle = last_active.elapsed();
        if idle >= IDLE_NOTICE_AFTER {
            reported_idle = true;
            let _ = app.emit(
                "agent-job://idle",
                JobIdle { job_id: job_id.clone(), idle_secs: idle.as_secs() },
            );
        }
        if can_kill && idle >= IDLE_KILL_AFTER {
            eprintln!(
                "[agent-job] {} idle for {}s after {}s, killing",
                job_id,
                idle.as_secs(),
                started.elapsed().as_secs()
            );
            timed_out.store(true, Ordering::SeqCst);
            kill_process_group(pgid);
            return;
        }
    }
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
#[tauri::command(async)]
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

    // CLIs without a system-prompt flag get the autonomy rules folded into the
    // prompt itself; the rest already carry them on the command line above.
    let prompt = if agent.system_prompt_flag.is_none() {
        format!("{}\n\n{}", AUTONOMY_PROMPT, prompt)
    } else {
        prompt
    };

    let mut cmd = crate::util::login_shell_command(&command);
    cmd.current_dir(&cwd)
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

    // Both readers feed one channel; a batcher thread turns it into coalesced
    // events. Every sender must be dropped for the batcher to finish, so the
    // original `tx` is moved into the last reader (or dropped outright below).
    let started = Instant::now();
    // Milliseconds since `started` of the last output line, for the watchdog.
    let last_output_ms = Arc::new(AtomicU64::new(0));
    let (tx, rx) = std::sync::mpsc::channel::<JobLine>();
    let batcher = {
        let app = app_handle.clone();
        let id = job_id.clone();
        std::thread::spawn(move || batch_job_output(rx, app, id))
    };

    // Stream stdout line-by-line into the batcher.
    let stdout_reader = child.stdout.take().map(|stdout| {
        let log = log_file.clone();
        let tx = tx.clone();
        let last_output_ms = last_output_ms.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                last_output_ms.store(started.elapsed().as_millis() as u64, Ordering::Relaxed);
                append_log(&log, &line);
                let _ = tx.send(JobLine {
                    stream: "stdout".to_string(),
                    chunk: line,
                });
            }
        })
    });

    // Stream stderr line-by-line into the same batcher.
    let stderr_reader = child.stderr.take().map(|stderr| {
        let log = log_file.clone();
        let tx = tx.clone();
        let last_output_ms = last_output_ms.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                last_output_ms.store(started.elapsed().as_millis() as u64, Ordering::Relaxed);
                append_log(&log, &line);
                let _ = tx.send(JobLine {
                    stream: "stderr".to_string(),
                    chunk: line,
                });
            }
        })
    });
    drop(tx);

    let timed_out = Arc::new(AtomicBool::new(false));
    // Dropping `stop_watchdog` (when the job exits) ends the watchdog.
    let (stop_watchdog, stop_rx) = std::sync::mpsc::channel::<()>();
    {
        let app = app_handle.clone();
        let id = job_id.clone();
        let timed_out = timed_out.clone();
        std::thread::spawn(move || {
            watch_job(app, id, pid, started, last_output_ms, timed_out, stop_rx)
        });
    }

    // Wait for completion in a background thread, then emit done + clean up.
    // The readers and the batcher are joined first: a process can exit while its
    // pipes still hold buffered output, and batching widens that window, so
    // without this the frontend could finalize a job before its last lines land.
    let app = app_handle.clone();
    let store_inner = store.inner().clone();
    let id = job_id.clone();
    std::thread::spawn(move || {
        let exit_code = match child.wait() {
            Ok(status) => status.code().unwrap_or(-1),
            Err(_) => -1,
        };
        drop(stop_watchdog);
        if let Some(handle) = stdout_reader {
            let _ = handle.join();
        }
        if let Some(handle) = stderr_reader {
            let _ = handle.join();
        }
        let _ = batcher.join();
        if let Ok(mut jobs) = store_inner.jobs.lock() {
            jobs.remove(&id);
        }
        let _ = app.emit(
            "agent-job://done",
            JobDone {
                job_id: id,
                exit_code,
                success: exit_code == 0,
                timed_out: timed_out.load(Ordering::SeqCst),
            },
        );
    });

    Ok(())
}

/// Cancel a running agent job by killing its process group (SIGTERM).
#[tauri::command(async)]
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

    // Negative pid targets the whole process group (see process_group(0)
    // above); SIGKILL follows for an agent that ignores SIGTERM, so a job can
    // never get stuck half-cancelled.
    let killed = kill_process_group(pid);

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
