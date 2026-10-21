use crate::commit_watcher::CommitWatcherStore;
use crate::pty::manager;
use crate::pty::session::SessionHandle;
use crate::state::AppState;
use std::io::Read;
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// While output is continuous, flush at most this often. An isolated chunk
/// (interactive echo, a prompt redraw) goes out immediately instead.
const PTY_FLUSH_INTERVAL: Duration = Duration::from_millis(8);
/// Flush early once this many bytes accumulate — bounds memory and keeps big
/// bursts moving without waiting out the interval.
const PTY_FLUSH_SIZE: usize = 32 * 1024;

const PROCESS_EXITED_NOTICE: &[u8] = b"\r\n[Process exited]\r\n";

fn join_error(e: impl std::fmt::Display) -> String {
    format!("Task join error: {}", e)
}

/// Clone a session's handle out of the map and release the global lock at once.
fn get_session(state: &AppState, session_id: &str) -> Result<Arc<SessionHandle>, String> {
    state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?
        .pty_sessions
        .get(session_id)
        .cloned()
        .ok_or_else(|| format!("Session not found: {}", session_id))
}

/// Coalesce PTY output before it crosses the Rust→JS IPC boundary.
///
/// A naive reader sends one IPC message per read (~8 KB). Under heavy output
/// (build logs, TUI redraws, `cat` of a large file) that is thousands of
/// round-trips per second — each waking the webview event loop, the classic
/// cause of terminal jank and pinned CPU.
///
/// Leading edge: a chunk that arrives after the stream has been quiet for a
/// full `PTY_FLUSH_INTERVAL` is sent immediately, so a single echoed keystroke
/// pays no batching latency. Only while output keeps coming are chunks held,
/// until `PTY_FLUSH_SIZE` bytes or `PTY_FLUSH_INTERVAL` after the first held
/// byte. When the reader drops its sender we flush what remains and return —
/// so a caller that joins this thread knows all output was sent before it
/// sends anything after it (e.g. "[Process exited]").
///
/// When nothing is buffered we block on `recv()` (no timeout): an idle terminal
/// must cost zero wakeups, which matters when many tabs each hold a quiet
/// nvim/lazygit.
fn batch_emit_loop(rx: Receiver<Vec<u8>>, session: &SessionHandle) {
    let mut pending: Vec<u8> = Vec::new();
    // Some(_) once data is buffered: the instant by which we must flush.
    let mut deadline: Option<Instant> = None;
    let mut last_flush: Option<Instant> = None;
    let flush = |pending: &mut Vec<u8>, deadline: &mut Option<Instant>, last_flush: &mut Option<Instant>| {
        session.output.emit(std::mem::take(pending));
        *deadline = None;
        *last_flush = Some(Instant::now());
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
            Ok(chunk) => {
                let quiet = deadline.is_none()
                    && last_flush.is_none_or(|t| t.elapsed() >= PTY_FLUSH_INTERVAL);
                pending.extend_from_slice(&chunk);
                if quiet || pending.len() >= PTY_FLUSH_SIZE {
                    flush(&mut pending, &mut deadline, &mut last_flush);
                } else if deadline.is_none() {
                    deadline = Some(Instant::now() + PTY_FLUSH_INTERVAL);
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                if !pending.is_empty() {
                    flush(&mut pending, &mut deadline, &mut last_flush);
                }
            }
            Err(RecvTimeoutError::Disconnected) => {
                if !pending.is_empty() {
                    flush(&mut pending, &mut deadline, &mut last_flush);
                }
                break;
            }
        }
    }
}

/// Drain the PTY until EOF, an error, or the session is closed, handing each
/// chunk to `forward` (which returns false to stop). Parks while the frontend
/// has paused the session. Returns true when the child exited on its own.
fn pump_output(
    session: &SessionHandle,
    reader: &mut dyn Read,
    mut forward: impl FnMut(&[u8]) -> bool,
) -> bool {
    let mut buf = [0u8; 8192];
    loop {
        if !session.gate.wait_while_paused() {
            return false;
        }
        match reader.read(&mut buf) {
            Ok(0) => return !session.gate.is_closed(),
            Ok(n) => {
                if session.gate.is_closed() || !forward(&buf[..n]) {
                    return false;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => {
                if !session.gate.is_closed() {
                    eprintln!("Error reading from PTY: {}", e);
                }
                return false;
            }
        }
    }
}

/// Reader thread for an interactive terminal: raw bytes go to the session's
/// output sink, and from there to whichever frontend is attached (xterm decodes
/// UTF-8 itself, including sequences split across reads).
fn spawn_output_reader(session: Arc<SessionHandle>, mut reader: Box<dyn Read + Send>) {
    thread::spawn(move || {
        // Batch on a dedicated emitter thread: the reader stays tight on the
        // PTY while sends are coalesced (see batch_emit_loop).
        let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
        let emitter = {
            let session = session.clone();
            thread::spawn(move || batch_emit_loop(rx, &session))
        };

        let exited = pump_output(&session, &mut reader, |chunk| tx.send(chunk.to_vec()).is_ok());

        // Drain the emitter first, then send the notice down the same ordered
        // channel, so it always lands after the last byte of output.
        drop(tx);
        let _ = emitter.join();
        if exited {
            session.output.emit(PROCESS_EXITED_NOTICE.to_vec());
        }
    });
}

/// Spawn an interactive shell. Output streams as raw bytes over `output`
/// (a `Channel` from `@tauri-apps/api/core`), in order; when the shell exits
/// on its own a final "[Process exited]" line is sent on the same channel.
#[tauri::command]
pub async fn spawn_terminal(
    rows: u16,
    cols: u16,
    sandbox: bool,
    sandbox_no_net: bool,
    project_dir: Option<String>,
    output: Channel,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // The id exists before the shell does: the shell's env carries it, so
    // agent hooks running inside can say which terminal they belong to.
    let session_id = Uuid::new_v4().to_string();
    let env = crate::agent_hooks::session_env(&session_id);
    let (session, reader) = tauri::async_runtime::spawn_blocking(move || {
        manager::spawn_pty(rows, cols, sandbox, sandbox_no_net, project_dir, env)
    })
    .await
    .map_err(join_error)??;

    let session = Arc::new(session);
    let sandboxed = session.sandboxed;

    state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?
        .pty_sessions
        .insert(session_id.clone(), session.clone());

    session.output.attach(output, false);
    spawn_output_reader(session, reader);

    Ok(serde_json::json!({
        "session_id": session_id,
        "sandboxed": sandboxed,
    }))
}

/// Reconnect a frontend to a session that outlived its webview (a reload). The
/// session's recent output is replayed on `output` before live output resumes.
/// Fails when the session is gone, and the caller spawns a fresh one.
#[tauri::command]
pub fn attach_terminal(
    session_id: String,
    output: Channel,
    state: tauri::State<AppState>,
) -> Result<serde_json::Value, String> {
    let session = get_session(&state, &session_id)?;
    session.output.attach(output, true);
    session.nudge_redraw();
    Ok(serde_json::json!({
        "session_id": session_id,
        "sandboxed": session.sandboxed,
    }))
}

/// A page load drops every frontend channel. Mark the sessions detached and
/// unpark any reader the old frontend had paused, since nobody is left to
/// resume it.
pub fn detach_all_terminals(state: &AppState) {
    let sessions: Vec<Arc<SessionHandle>> = match state.lock() {
        Ok(st) => st.pty_sessions.values().cloned().collect(),
        Err(_) => return,
    };
    for session in sessions {
        session.output.detach();
        session.gate.resume();
    }
}

/// Close the detached sessions the reloaded frontend won't reattach: ones whose
/// tabs were closed before the reload. `keep` lists the sessions it will claim.
#[tauri::command]
pub async fn reap_detached_terminals(
    keep: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
    let orphans: Vec<(String, Arc<SessionHandle>)> = {
        let mut st = state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?;
        let ids: Vec<String> = st
            .pty_sessions
            .iter()
            .filter(|(id, s)| s.output.is_detached() && !keep.contains(id))
            .map(|(id, _)| id.clone())
            .collect();
        ids.into_iter()
            .filter_map(|id| st.pty_sessions.remove(&id).map(|s| (id, s)))
            .collect()
    };
    let count = orphans.len();
    tauri::async_runtime::spawn_blocking(move || {
        for (id, session) in orphans {
            session.terminate();
            crate::agent_hooks::remove_session_log(&id);
        }
    })
    .await
    .map_err(join_error)?;
    Ok(count)
}

// write/resize/pause/resume stay synchronous on purpose: each is a map lookup
// plus a non-blocking call (channel send, ioctl, atomic flip), so the main
// thread pays microseconds — and synchronous commands run in invocation order,
// which keystrokes and successive resizes depend on. Async commands are each
// spawned as their own task and can overtake one another.

#[tauri::command]
pub fn write_to_terminal(
    session_id: String,
    data: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    get_session(&state, &session_id)?.write(data.into_bytes())
}

#[tauri::command]
pub fn resize_terminal(
    session_id: String,
    rows: u16,
    cols: u16,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    get_session(&state, &session_id)?.resize(rows, cols)
}

/// Flow control: stop draining the PTY while xterm catches up. The kernel
/// buffer then fills and throttles the child.
#[tauri::command]
pub fn pty_pause(session_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    get_session(&state, &session_id)?.gate.pause();
    Ok(())
}

#[tauri::command]
pub fn pty_resume(session_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    get_session(&state, &session_id)?.gate.resume();
    Ok(())
}

#[tauri::command]
pub async fn close_terminal(
    session_id: String,
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let session = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?
        .pty_sessions
        .remove(&session_id);

    if let Some(session) = session {
        // Kill, then wait so the child is reaped rather than left a zombie.
        tauri::async_runtime::spawn_blocking(move || session.terminate())
            .await
            .map_err(join_error)?;
        crate::agent_hooks::remove_session_log(&session_id);

        let _ = app.emit(
            "terminal-closed",
            serde_json::json!({"session_id": session_id}),
        );
    }

    Ok(())
}

/// Run `command` through the login shell on a PTY nobody sees. Its output is
/// drained and discarded; "hidden-terminal-closed" fires when it exits.
#[tauri::command]
pub async fn spawn_hidden_terminal(
    project_dir: String,
    command: String,
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};

    let session_id = Uuid::new_v4().to_string();
    eprintln!("[hidden-terminal] Spawning: {} in {}", command, project_dir);

    let (session, mut reader) = tauri::async_runtime::spawn_blocking(move || {
        let pty_system = NativePtySystem::default();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        // Parse the command: run via shell -c
        let mut cmd = CommandBuilder::new(crate::util::user_shell());
        cmd.args(["-lc", &command]);
        cmd.env("TERM", "xterm-256color");
        cmd.cwd(&project_dir);

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn hidden terminal: {}", e))?;

        SessionHandle::new(pty_pair.master, child, false)
    })
    .await
    .map_err(join_error)??;

    let session = Arc::new(session);
    let state_inner = state.inner().clone();
    state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?
        .pty_sessions
        .insert(session_id.clone(), session.clone());

    let sid = session_id.clone();
    thread::spawn(move || {
        // Keep draining so the child never blocks on a full PTY buffer.
        let exited = pump_output(&session, &mut reader, |_| true);
        if session.gate.is_closed() {
            // close_terminal took it down and is reaping it.
            return;
        }
        let _ = session.child.wait();
        if let Ok(mut st) = state_inner.lock() {
            st.pty_sessions.remove(&sid);
        }
        let payload = if exited {
            serde_json::json!({"session_id": sid})
        } else {
            serde_json::json!({"session_id": sid, "error": true})
        };
        let _ = app.emit("hidden-terminal-closed", payload);
    });

    Ok(session_id)
}

#[tauri::command]
pub fn start_commit_watcher(
    repo_path: String,
    app: AppHandle,
    store: tauri::State<CommitWatcherStore>,
) -> Result<(), String> {
    let path = PathBuf::from(&repo_path);
    crate::commit_watcher::start_watcher(path, app, store.inner().clone())
}

#[tauri::command]
pub fn stop_commit_watcher(
    repo_path: String,
    store: tauri::State<CommitWatcherStore>,
) -> Result<(), String> {
    let path = PathBuf::from(&repo_path);
    crate::commit_watcher::stop_watcher(&path, store.inner())
}

/// How deep below the shell to look (bwrap → shell → wrapper → cli …).
const MAX_DESCENDANT_DEPTH: usize = 10;

/// The PID of a session's shell, copied out so no lock is held while the
/// process tree is walked.
fn session_pid(state: &AppState, session_id: &str) -> Result<u32, String> {
    get_session(state, session_id)?
        .child
        .process_id()
        .ok_or_else(|| "Process has no PID".to_string())
}

/// Find a descendant of `root` whose process name contains `target`
/// (lowercase). Blocking: run it off the main thread.
fn find_descendant(root: u32, target: &str) -> Option<u32> {
    #[cfg(target_os = "linux")]
    if procfs::children_supported() {
        return procfs::find_descendant(root, target);
    }
    find_descendant_sysinfo(root, target)
}

/// Linux fast path: walk only the shell's subtree through
/// /proc/<pid>/task/<tid>/children instead of scanning every process.
#[cfg(target_os = "linux")]
mod procfs {
    use super::MAX_DESCENDANT_DEPTH;
    use std::fs;
    use std::os::unix::ffi::OsStrExt;
    use std::sync::OnceLock;

    /// The children files need CONFIG_PROC_CHILDREN; probe our own once.
    pub fn children_supported() -> bool {
        static SUPPORTED: OnceLock<bool> = OnceLock::new();
        *SUPPORTED.get_or_init(|| {
            let pid = std::process::id();
            fs::metadata(format!("/proc/{}/task/{}/children", pid, pid)).is_ok()
        })
    }

    fn children(pid: u32) -> Vec<u32> {
        let Ok(tasks) = fs::read_dir(format!("/proc/{}/task", pid)) else {
            return Vec::new();
        };
        tasks
            .flatten()
            .filter_map(|task| fs::read_to_string(task.path().join("children")).ok())
            .flat_map(|list| {
                list.split_whitespace()
                    .filter_map(|p| p.parse().ok())
                    .collect::<Vec<u32>>()
            })
            .collect()
    }

    /// Same notion of "name" as sysinfo: `comm`, or argv[0]'s basename when
    /// `comm` hit the kernel's 15-byte limit and may be cut short.
    fn name_matches(pid: u32, target: &str) -> bool {
        let Ok(comm) = fs::read_to_string(format!("/proc/{}/comm", pid)) else {
            return false;
        };
        let comm = comm.trim_end();
        if comm.to_lowercase().contains(target) {
            return true;
        }
        if comm.len() < 15 {
            return false;
        }
        fs::read(format!("/proc/{}/cmdline", pid))
            .ok()
            .and_then(|cmdline| {
                let argv0 = cmdline.split(|b| *b == 0).next()?;
                let base = std::path::Path::new(std::ffi::OsStr::from_bytes(argv0)).file_name()?;
                Some(base.to_string_lossy().to_lowercase().contains(target))
            })
            .unwrap_or(false)
    }

    pub fn find_descendant(root: u32, target: &str) -> Option<u32> {
        let mut level = vec![root];
        for _ in 0..MAX_DESCENDANT_DEPTH {
            let mut next = Vec::new();
            for pid in level {
                for child in children(pid) {
                    if name_matches(child, target) {
                        return Some(child);
                    }
                    next.push(child);
                }
            }
            if next.is_empty() {
                break;
            }
            level = next;
        }
        None
    }
}

/// Portable fallback: one full process scan, then check ancestry.
fn find_descendant_sysinfo(root: u32, target: &str) -> Option<u32> {
    use sysinfo::{Pid, ProcessesToUpdate, System};

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let ancestor = Pid::from_u32(root);

    let is_descendant = |pid: Pid| {
        let mut current = pid;
        for _ in 0..MAX_DESCENDANT_DEPTH {
            match sys.process(current).and_then(|p| p.parent()) {
                Some(parent) if parent == ancestor => return true,
                Some(parent) => current = parent,
                None => return false,
            }
        }
        false
    };

    sys.processes()
        .iter()
        .find(|(pid, process)| {
            process.name().to_string_lossy().to_lowercase().contains(target) && is_descendant(**pid)
        })
        .map(|(pid, _)| pid.as_u32())
}

#[tauri::command]
pub async fn check_pty_child_process(
    session_id: String,
    process_name: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let shell_pid = session_pid(&state, &session_id)?;
    let target = process_name.to_lowercase();
    tauri::async_runtime::spawn_blocking(move || find_descendant(shell_pid, &target).is_some())
        .await
        .map_err(join_error)
}

/// Kill a named child process running under the PTY session (e.g. claude, opencode).
/// Sends SIGKILL to terminate the process immediately.
#[tauri::command]
pub async fn kill_pty_child_process(
    session_id: String,
    process_name: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    use sysinfo::{Pid, ProcessesToUpdate, System};

    let shell_pid = session_pid(&state, &session_id)?;
    let target = process_name.to_lowercase();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(pid) = find_descendant(shell_pid, &target).map(Pid::from_u32) else {
            return false;
        };
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
        if let Some(process) = sys.process(pid) {
            process.kill();
        }
        true
    })
    .await
    .map_err(join_error)
}
