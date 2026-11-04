use super::{AgentJobStore, JobChild};
use process_wrap::std::CommandWrap;
use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
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
/// Kill a job idle this long. Output alone can't tell a stuck job from
/// `claude -p`, which prints nothing until it finishes, so CPU use counts too.
const IDLE_KILL_AFTER: Duration = Duration::from_secs(15 * 60);
/// CPU a job must use, as a share of one core averaged over a watchdog
/// interval, to count as working. An agent streaming a response stays well
/// above this; one blocked on a prompt nobody will answer stays below it.
const ACTIVE_CPU_PERCENT: f32 = 0.3;

/// How long a cancelled job gets to exit before it is killed outright.
#[cfg(unix)]
const SOFT_STOP_GRACE: Duration = Duration::from_secs(3);
/// How often the waiter checks whether a job has exited. It polls so that
/// cancelling can take the job's lock in between.
const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(100);

/// `root` and every process it started, by following parent links.
fn process_tree(sys: &System, root: u32) -> HashSet<Pid> {
    let mut tree = HashSet::from([Pid::from_u32(root)]);
    loop {
        let before = tree.len();
        for (pid, process) in sys.processes() {
            // Windows keeps a dead parent's pid on its orphans, so an older process can look like a child.
            let child_of_tree = process.parent().and_then(|p| sys.process(p)).is_some_and(|parent| {
                tree.contains(&parent.pid()) && process.start_time() >= parent.start_time()
            });
            if child_of_tree {
                tree.insert(*pid);
            }
        }
        if tree.len() == before {
            return tree;
        }
    }
}

/// CPU use since the last refresh of `sys`, summed over process `root` and
/// everything it started.
fn process_tree_cpu_percent(sys: &mut System, root: u32) -> f32 {
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cpu());
    process_tree(sys, root).iter().filter_map(|pid| sys.process(*pid)).map(|p| p.cpu_usage()).sum()
}

/// The tree under `root` with each process's start time, taken before the
/// job is stopped: once a parent dies its children no longer lead back to it.
fn snapshot_tree(root: u32) -> Vec<(Pid, u64)> {
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    process_tree(&sys, root)
        .into_iter()
        .filter_map(|pid| sys.process(pid).map(|p| (pid, p.start_time())))
        .collect()
}

/// Kill what is left of a snapshot. The start time keeps a reused pid safe.
fn kill_snapshot(tree: &[(Pid, u64)]) {
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    for (pid, started) in tree {
        if let Some(p) = sys.process(*pid).filter(|p| p.start_time() == *started) {
            p.kill();
        }
    }
}

/// The tree of a job still running; empty for a reaped one, whose pid may already belong to another process.
fn snapshot_if_running(child: &mut dyn process_wrap::std::ChildWrapper) -> Vec<(Pid, u64)> {
    if matches!(child.try_wait(), Ok(None)) { snapshot_tree(child.id()) } else { Vec::new() }
}

/// Stop a job and everything it started: SIGTERM first on Unix, SIGKILL if it
/// is still there after a few seconds; Windows has only the forced stop. Any
/// process that left the job's group is killed from a snapshot of its tree.
fn stop_job(child: &JobChild) -> bool {
    let Ok(mut guard) = child.lock() else { return false };
    let tree = snapshot_if_running(&mut **guard);
    #[cfg(unix)]
    {
        let stopped = guard.signal(15).is_ok();
        drop(guard);
        let child = child.clone();
        std::thread::spawn(move || {
            std::thread::sleep(SOFT_STOP_GRACE);
            // Also when the leader is gone: an orphan in the group may have ignored SIGTERM.
            if let Ok(mut c) = child.lock() {
                let _ = c.start_kill();
            }
            kill_snapshot(&tree);
        });
        stopped
    }
    #[cfg(not(unix))]
    {
        let stopped = guard.start_kill().is_ok();
        kill_snapshot(&tree);
        stopped
    }
}

/// Watch a running job for the case its spinner can't show: no output and no
/// CPU work, typically an agent blocked on an approval no one can give.
/// Reports idle spells as `agent-job://idle` and kills a job idle for
/// IDLE_KILL_AFTER. Returns when `stop` is dropped or signalled.
fn watch_job(
    app: AppHandle,
    job_id: String,
    child: JobChild,
    started: Instant,
    last_output_ms: Arc<AtomicU64>,
    timed_out: Arc<AtomicBool>,
    stop: Receiver<()>,
) {
    let pid = match child.lock() {
        Ok(c) => c.id(),
        Err(_) => return,
    };
    let mut sys = System::new();
    process_tree_cpu_percent(&mut sys, pid);
    let mut last_active = Instant::now();
    let mut reported_idle = false;
    let mut seen_output_ms = 0;
    loop {
        match stop.recv_timeout(WATCHDOG_INTERVAL) {
            Err(RecvTimeoutError::Timeout) => {}
            _ => return,
        }
        let output_ms = last_output_ms.load(Ordering::Relaxed);
        let busy = process_tree_cpu_percent(&mut sys, pid) >= ACTIVE_CPU_PERCENT;
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
        if idle >= IDLE_KILL_AFTER {
            eprintln!(
                "[agent-job] {} idle for {}s after {}s, killing",
                job_id,
                idle.as_secs(),
                started.elapsed().as_secs()
            );
            timed_out.store(true, Ordering::SeqCst);
            stop_job(&child);
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
#[tauri::command]
pub async fn run_agent_job(
    app_handle: AppHandle,
    store: tauri::State<'_, Arc<AgentJobStore>>,
    job_id: String,
    cli: String,
    prompt: String,
    cwd: String,
    log_path: Option<String>,
    stream_json: Option<bool>,
) -> Result<(), String> {
    let store = store.inner().clone();
    crate::ipc::blocking("run_agent_job", move || {
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
        let mut wrap = CommandWrap::from(cmd);
        #[cfg(unix)]
        wrap.wrap(process_wrap::std::ProcessGroup::leader());
        #[cfg(windows)]
        wrap.wrap(process_wrap::std::CreationFlags(windows::Win32::System::Threading::CREATE_NO_WINDOW))
            .wrap(process_wrap::std::JobObject);
        let mut child = wrap
            .spawn()
            .map_err(|e| format!("Failed to spawn agent job: {}", e))?;

        // Feed the prompt via stdin, then close it so the CLI starts working.
        if let Some(mut stdin) = child.stdin().take() {
            stdin
                .write_all(prompt.as_bytes())
                .map_err(|e| format!("Failed to write prompt to stdin: {}", e))?;
            // Dropping stdin (end of scope) sends EOF.
            let _ = stdin.flush();
        }

        let stdout = child.stdout().take();
        let stderr = child.stderr().take();
        let child: JobChild = Arc::new(Mutex::new(child));
        store
            .jobs
            .lock()
            .map_err(|e| format!("Failed to lock job store: {}", e))?
            .insert(job_id.clone(), child.clone());

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
        let stdout_reader = stdout.map(|stdout| {
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
        let stderr_reader = stderr.map(|stderr| {
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
            let child = child.clone();
            std::thread::spawn(move || {
                watch_job(app, id, child, started, last_output_ms, timed_out, stop_rx)
            });
        }

        // Wait for completion in a background thread, then emit done + clean up.
        // The readers and the batcher are joined first: a process can exit while its
        // pipes still hold buffered output, and batching widens that window, so
        // without this the frontend could finalize a job before its last lines land.
        let app = app_handle.clone();
        let store_inner = store.clone();
        let id = job_id.clone();
        std::thread::spawn(move || {
            let exit_code = loop {
                let polled = child.lock().map(|mut c| c.try_wait());
                match polled {
                    Ok(Ok(None)) => std::thread::sleep(EXIT_POLL_INTERVAL),
                    Ok(Ok(Some(status))) => break status.code().unwrap_or(-1),
                    _ => break -1,
                }
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
    })
    .await
}

/// Cancel a running agent job and everything it started.
#[tauri::command]
pub async fn cancel_agent_job(
    store: tauri::State<'_, Arc<AgentJobStore>>,
    job_id: String,
) -> Result<bool, String> {
    let store = store.inner().clone();
    crate::ipc::blocking("cancel_agent_job", move || {
        let child = {
            let jobs = store
                .jobs
                .lock()
                .map_err(|e| format!("Failed to lock job store: {}", e))?;
            jobs.get(&job_id).cloned()
        };

        let Some(child) = child else {
            return Ok(false);
        };

        let killed = stop_job(&child);

        if let Ok(mut jobs) = store.jobs.lock() {
            jobs.remove(&job_id);
        }

        Ok(killed)
    })
    .await
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[cfg(windows)]
    const LONG: &str = "ping -t 127.0.0.1";
    #[cfg(unix)]
    const LONG: &str = "sleep 597 & wait";
    #[cfg(windows)]
    const BUSY: &str = "while($true){}";
    #[cfg(unix)]
    const BUSY: &str = "while :; do :; done";
    #[cfg(windows)]
    const IDLE: &str = "Start-Sleep 600";
    #[cfg(unix)]
    const IDLE: &str = "sleep 600";

    fn spawn_job(script: &str) -> JobChild {
        let mut cmd = crate::util::login_shell_command(script);
        cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        let mut wrap = CommandWrap::from(cmd);
        #[cfg(unix)]
        wrap.wrap(process_wrap::std::ProcessGroup::leader());
        #[cfg(windows)]
        wrap.wrap(process_wrap::std::CreationFlags(windows::Win32::System::Threading::CREATE_NO_WINDOW))
            .wrap(process_wrap::std::JobObject);
        Arc::new(Mutex::new(wrap.spawn().unwrap()))
    }

    /// Kills whatever is left of a snapshot when a test ends, pass or fail.
    struct Cleanup(Vec<(Pid, u64)>);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            kill_snapshot(&self.0);
        }
    }

    fn wait_until(what: &str, mut done: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while !done() {
            assert!(Instant::now() < deadline, "timed out waiting for {what}");
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    fn descendants(root: u32) -> Vec<(Pid, u64)> {
        snapshot_tree(root).into_iter().filter(|(pid, _)| pid.as_u32() != root).collect()
    }

    fn any_alive(tree: &[(Pid, u64)]) -> bool {
        let mut sys = System::new();
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
        tree.iter().any(|(pid, started)| sys.process(*pid).is_some_and(|p| p.start_time() == *started))
    }

    #[test]
    fn stop_job_kills_the_job_and_its_descendants() {
        let job = spawn_job(LONG);
        let root = job.lock().unwrap().id();
        let mut tree = Cleanup(Vec::new());
        wait_until("a child of the job", || {
            tree.0 = descendants(root);
            !tree.0.is_empty()
        });

        assert!(stop_job(&job));

        wait_until("the job to exit", || job.lock().unwrap().try_wait().unwrap().is_some());
        wait_until("its descendants to die", || !any_alive(&tree.0));
    }

    #[test]
    fn snapshot_catches_a_child_whose_parent_died_first() {
        #[cfg(windows)]
        let mut parent = Command::new("cmd").args(["/c", LONG]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
        #[cfg(unix)]
        let mut parent = Command::new("sh").args(["-c", LONG]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
        let root = parent.id();
        let mut orphans = Cleanup(Vec::new());
        wait_until("a child of the parent", || {
            orphans.0 = descendants(root);
            !orphans.0.is_empty()
        });

        parent.kill().unwrap();
        parent.wait().unwrap();
        assert!(any_alive(&orphans.0), "the child should outlive its parent");

        kill_snapshot(&orphans.0);
        wait_until("the orphan to die", || !any_alive(&orphans.0));
    }

    #[test]
    fn only_a_running_job_is_snapshotted() {
        let job = spawn_job(IDLE);
        let live = snapshot_if_running(&mut **job.lock().unwrap());
        let _cleanup = Cleanup(live.clone());
        assert!(!live.is_empty());

        assert!(stop_job(&job));
        wait_until("the job to exit", || job.lock().unwrap().try_wait().unwrap().is_some());
        assert!(snapshot_if_running(&mut **job.lock().unwrap()).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn stop_job_kills_an_orphan_that_ignores_sigterm() {
        let job = spawn_job("(trap '' TERM; exec sleep 598) & exit 0");
        wait_until("the leader to exit", || job.lock().unwrap().try_wait().unwrap().is_some());
        // The subshell may not have exec'd sleep yet when the leader exits.
        let mut cleanup = Cleanup(Vec::new());
        wait_until("the orphan sleep", || {
            let mut sys = System::new();
            sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::everything());
            cleanup.0 = sys
                .processes()
                .iter()
                .filter(|(_, p)| p.cmd().iter().any(|a| a == "598"))
                .map(|(pid, p)| (*pid, p.start_time()))
                .collect();
            !cleanup.0.is_empty()
        });

        stop_job(&job);

        wait_until("the orphan to die", || !any_alive(&cleanup.0));
    }

    #[test]
    fn cpu_percent_tells_a_busy_job_from_an_idle_one() {
        let busy = spawn_job(BUSY);
        let idle = spawn_job(IDLE);
        let busy_pid = busy.lock().unwrap().id();
        let idle_pid = idle.lock().unwrap().id();
        let mut cleanup = Cleanup(Vec::new());
        cleanup.0.extend(snapshot_tree(busy_pid));
        cleanup.0.extend(snapshot_tree(idle_pid));

        // Let the shells finish starting up; their start-up cost is not idle CPU.
        std::thread::sleep(Duration::from_secs(3));
        let mut sys = System::new();
        process_tree_cpu_percent(&mut sys, busy_pid);
        // A loaded machine may starve the busy loop for a window, so look at a few.
        let (mut busy_cpu, mut idle_cpu) = (0.0, 0.0);
        for _ in 0..5 {
            std::thread::sleep(Duration::from_secs(2));
            busy_cpu = process_tree_cpu_percent(&mut sys, busy_pid);
            idle_cpu = process_tree_cpu_percent(&mut sys, idle_pid);
            if busy_cpu > 5.0 {
                break;
            }
        }

        assert!(busy_cpu > 5.0, "busy job used {busy_cpu}%");
        assert!(idle_cpu < busy_cpu / 2.0, "idle job used {idle_cpu}%, busy {busy_cpu}%");
        stop_job(&busy);
        stop_job(&idle);
    }
}
