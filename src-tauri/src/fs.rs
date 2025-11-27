use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use crate::state::AppState;

#[derive(Serialize)]
pub struct DirectoryEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
pub fn read_directory(path: Option<String>) -> Result<Vec<DirectoryEntry>, String> {
    let dir_path = if let Some(p) = path {
        PathBuf::from(p)
    } else {
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?
    };

    let entries = fs::read_dir(&dir_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut result = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();

        result.push(DirectoryEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
        });
    }

    // Sort: directories first, then files, both alphabetically
    result.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(result)
}

#[tauri::command]
pub fn get_terminal_cwd(session_id: String, state: tauri::State<AppState>) -> Result<String, String> {
    let sessions = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    // Get the PID of the child process (shell)
    let pid = session.child.process_id()
        .ok_or_else(|| "Failed to get process ID".to_string())?;

    #[cfg(target_os = "linux")]
    {
        // On Linux, read /proc/[pid]/cwd symlink
        let cwd_link = format!("/proc/{}/cwd", pid);
        fs::read_link(&cwd_link)
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to read cwd from /proc: {}", e))
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Getting terminal cwd is only supported on Linux".to_string())
    }
}

#[tauri::command]
pub fn detect_claude_env(session_id: String, state: tauri::State<AppState>) -> Result<bool, String> {
    let sessions = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let pid = session.child.process_id()
        .ok_or_else(|| "Failed to get process ID".to_string())?;

    #[cfg(target_os = "linux")]
    {
        println!("Checking for Claude Code (shell PID: {})...", pid);

        // Check if Claude Code is running as a child process of the shell
        // Read /proc to find all processes
        if let Ok(entries) = fs::read_dir("/proc") {
            for entry in entries.flatten() {
                if let Ok(file_name) = entry.file_name().into_string() {
                    // Check if it's a numeric directory (process ID)
                    if file_name.chars().all(|c| c.is_numeric()) {
                        let proc_pid = file_name;

                        // Read the status file to check parent PID
                        let status_path = format!("/proc/{}/status", proc_pid);
                        if let Ok(status) = fs::read_to_string(&status_path) {
                            // Check if this process's parent is our shell
                            if let Some(ppid_line) = status.lines().find(|line| line.starts_with("PPid:")) {
                                if let Some(ppid_str) = ppid_line.split_whitespace().nth(1) {
                                    if let Ok(ppid) = ppid_str.parse::<u32>() {
                                        if ppid == pid {
                                            // This is a child of our shell - check its command
                                            let cmdline_path = format!("/proc/{}/cmdline", proc_pid);
                                            if let Ok(cmdline) = fs::read_to_string(&cmdline_path) {
                                                let cmd = cmdline.replace('\0', " ");

                                                // Check if this child process is Claude Code
                                                if cmd.contains("claude-code") || cmd.contains("@anthropic-ai/claude-code") {
                                                    println!("✓ Claude Code detected as child process!");
                                                    println!("  Command: {}", cmd);
                                                    return Ok(true);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        println!("✗ Claude Code not detected as child process");
        Ok(false)
    }

    #[cfg(not(target_os = "linux"))]
    {
        // Graceful fallback for non-Linux platforms
        Ok(false)
    }
}
