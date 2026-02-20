use tauri::{AppHandle, Emitter};
use std::io::Read;
use std::sync::atomic::Ordering;
use std::thread;
use std::path::PathBuf;
use uuid::Uuid;
use crate::state::AppState;
use crate::commit_watcher::CommitWatcherStore;
use crate::pty::manager;

#[tauri::command]
pub fn spawn_terminal(
    rows: u16,
    cols: u16,
    sandbox: bool,
    sandbox_no_net: bool,
    project_dir: Option<String>,
    app: AppHandle,
    state: tauri::State<AppState>,
) -> Result<serde_json::Value, String> {
    // Generate a unique session ID
    let session_id = Uuid::new_v4().to_string();

    // Spawn the PTY
    let session = manager::spawn_pty(rows, cols, sandbox, sandbox_no_net, project_dir)?;
    let actually_sandboxed = session.sandboxed;

    // Clone the master for the reader thread
    let mut reader = session
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    // Clone shutdown flag for the reader thread
    let shutdown_flag = session.shutdown.clone();

    // Spawn a thread to read from PTY and emit events
    let session_id_clone = session_id.clone();
    let app_clone = app.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            // Check shutdown flag before reading
            if shutdown_flag.load(Ordering::SeqCst) {
                break;
            }

            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    // Check shutdown flag after read
                    if shutdown_flag.load(Ordering::SeqCst) {
                        break;
                    }

                    // Convert bytes to string (handling UTF-8)
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();

                    // Emit event to frontend
                    let _ = app_clone.emit("terminal-output", serde_json::json!({
                        "session_id": session_id_clone,
                        "data": data,
                    }));
                }
                Ok(_) => {
                    // EOF reached, process exited
                    if !shutdown_flag.load(Ordering::SeqCst) {
                        let _ = app_clone.emit("terminal-output", serde_json::json!({
                            "session_id": session_id_clone,
                            "data": "\r\n[Process exited]\r\n",
                        }));
                    }
                    break;
                }
                Err(e) => {
                    if !shutdown_flag.load(Ordering::SeqCst) {
                        eprintln!("Error reading from PTY: {}", e);
                    }
                    break;
                }
            }
        }
    });

    // Store the session
    state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?
        .pty_sessions
        .insert(session_id.clone(), session);

    Ok(serde_json::json!({
        "session_id": session_id,
        "sandboxed": actually_sandboxed,
    }))
}

#[tauri::command]
pub fn write_to_terminal(
    session_id: String,
    data: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let mut state_lock = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let session = state_lock
        .pty_sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    manager::write_to_pty(session, &data)
}

#[tauri::command]
pub fn resize_terminal(
    session_id: String,
    rows: u16,
    cols: u16,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let mut state_lock = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let session = state_lock
        .pty_sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    manager::resize_pty(session, rows, cols)
}

#[tauri::command]
pub fn close_terminal(
    session_id: String,
    app: AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let mut state_lock = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    if let Some(mut session) = state_lock.pty_sessions.remove(&session_id) {
        // Signal reader thread to stop
        session.shutdown.store(true, Ordering::SeqCst);

        // Kill child process
        let _ = session.child.kill();

        // Emit closed event
        let _ = app.emit(
            "terminal-closed",
            serde_json::json!({"session_id": session_id}),
        );
    }

    Ok(())
}

#[tauri::command]
pub fn spawn_hidden_terminal(
    project_dir: String,
    command: String,
    app: AppHandle,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    let session_id = Uuid::new_v4().to_string();
    eprintln!("[hidden-terminal] Spawning: {} in {}", command, project_dir);

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
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(&["-lc", &command]);
    cmd.env("TERM", "xterm-256color");
    cmd.cwd(&project_dir);

    let child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn hidden terminal: {}", e))?;

    let master = pty_pair.master;
    let writer = master
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    let mut reader = master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    let shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_flag = shutdown.clone();

    let session_id_clone = session_id.clone();
    let app_clone = app.clone();
    let state_inner = state.inner().clone();

    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            if shutdown_flag.load(Ordering::SeqCst) {
                break;
            }
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    if shutdown_flag.load(Ordering::SeqCst) {
                        break;
                    }
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(
                        "hidden-terminal-output",
                        serde_json::json!({
                            "session_id": session_id_clone,
                            "data": data,
                        }),
                    );
                }
                Ok(_) => {
                    // Process exited - auto-cleanup
                    let _ = app_clone.emit(
                        "hidden-terminal-closed",
                        serde_json::json!({"session_id": session_id_clone}),
                    );
                    // Remove from state
                    if let Ok(mut st) = state_inner.lock() {
                        st.pty_sessions.remove(&session_id_clone);
                    }
                    break;
                }
                Err(_) => {
                    let _ = app_clone.emit(
                        "hidden-terminal-closed",
                        serde_json::json!({"session_id": session_id_clone, "error": true}),
                    );
                    if let Ok(mut st) = state_inner.lock() {
                        st.pty_sessions.remove(&session_id_clone);
                    }
                    break;
                }
            }
        }
    });

    let session = crate::state::PtySession {
        master,
        child,
        writer,
        shutdown,
        sandboxed: false,
    };

    state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?
        .pty_sessions
        .insert(session_id.clone(), session);

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

#[tauri::command]
pub fn get_committable_files(repo_path: String) -> Result<Vec<serde_json::Value>, String> {
    let output = std::process::Command::new("git")
        .args(&["status", "--porcelain"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut files = Vec::new();

    for line in stdout.lines() {
        if line.len() < 4 { continue; }
        let status_code = &line[0..2];
        let path = line[3..].trim().to_string();

        // Determine status label
        let status = match status_code.trim() {
            "M" | "MM" | "AM" => "modified",
            "A" => "added",
            "D" => "deleted",
            "R" | "RM" => "renamed",
            "??" => "untracked",
            _ => "modified",
        };

        files.push(serde_json::json!({ "path": path, "status": status }));
    }

    Ok(files)
}

#[tauri::command]
pub fn run_git_command(repo_path: String, args: Vec<String>) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(&args)
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if !stderr.is_empty() {
            return Err(stderr);
        }
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

const DEFAULT_PROMPT: &str = "Generate a concise conventional commit message for this diff. Reply with ONLY the commit message, no explanation, no markdown formatting, no backticks:";

#[tauri::command(async)]
pub fn generate_commit_message(project_dir: String, cli: String, custom_prompt: Option<String>) -> Result<String, String> {
    // Get staged diff using git diff --cached via shell command
    let diff_output = std::process::Command::new("git")
        .args(&["diff", "--cached", "--no-color"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if !diff_output.status.success() {
        let stderr = String::from_utf8_lossy(&diff_output.stderr).to_string();
        return Err(format!("git diff failed: {}", stderr));
    }

    let diff = String::from_utf8_lossy(&diff_output.stdout);
    
    if diff.trim().is_empty() {
        return Err("No staged changes found. Please stage files first.".to_string());
    }

    // Build the prompt
    let base_prompt = custom_prompt.as_ref()
        .map(|p| format!("{}\n\nAdditional instructions: {}", DEFAULT_PROMPT, p.trim()))
        .unwrap_or_else(|| DEFAULT_PROMPT.to_string());
    
    // Truncate diff if too large (keep it under ~100KB for safety)
    let max_diff_size = 100_000;
    let truncated_diff = if diff.len() > max_diff_size {
        format!("{}\n\n... (diff truncated, showing first {} characters)", &diff[..max_diff_size], max_diff_size)
    } else {
        diff.to_string()
    };
    
    let full_prompt = format!("{}\n\n{}", base_prompt, truncated_diff);
    let escaped_prompt = full_prompt.replace('\'', "'\\''");
    
    // Try with free model first
    let (command, fallback_command) = match cli.as_str() {
        "opencode" => (
            format!("opencode run -m opencode/kimi-k2.5-free '{}'", escaped_prompt),
            Some(format!("opencode run -m opencode/kimi-k2.5 '{}'", escaped_prompt)),
        ),
        _ => (
            format!("claude --print '{}'", escaped_prompt),
            None,
        ),
    };

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    
    // First attempt with free model
    let output = std::process::Command::new(&shell)
        .args(&["-lc", &command])
        .current_dir(&project_dir)
        .env("TERM", "xterm-256color")
        .output()
        .map_err(|e| format!("Failed to run LLM command: {}", e))?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    // If free model failed and we have a fallback (paid model), try it silently
    if let Some(fallback) = fallback_command {
        let fallback_output = std::process::Command::new(&shell)
            .args(&["-lc", &fallback])
            .current_dir(&project_dir)
            .env("TERM", "xterm-256color")
            .output()
            .map_err(|e| format!("Failed to run LLM command: {}", e))?;

        if fallback_output.status.success() {
            return Ok(String::from_utf8_lossy(&fallback_output.stdout).trim().to_string());
        }
        
        // Both failed - return error from paid model attempt
        let stderr = String::from_utf8_lossy(&fallback_output.stderr).to_string();
        return Err(format!("LLM command failed: {}", stderr));
    }

    // No fallback available, return original error
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Err(format!("LLM command failed: {}", stderr))
}
