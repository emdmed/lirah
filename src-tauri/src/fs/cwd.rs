use std::fs;
use crate::state::AppState;

/// Find a child process of the given PID by reading /proc/[pid]/task/[tid]/children
#[cfg(target_os = "linux")]
fn find_child_pid(parent_pid: u32) -> Option<u32> {
    // Try /proc/[pid]/task/[pid]/children first (requires CONFIG_PROC_CHILDREN)
    let children_path = format!("/proc/{}/task/{}/children", parent_pid, parent_pid);
    if let Ok(content) = fs::read_to_string(&children_path) {
        if let Some(first) = content.split_whitespace().next() {
            if let Ok(child_pid) = first.parse::<u32>() {
                // Recurse to find the deepest child (shell, not intermediate bwrap)
                return Some(find_child_pid(child_pid).unwrap_or(child_pid));
            }
        }
    }
    None
}

#[tauri::command]
pub async fn get_terminal_cwd(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let state = state.inner().clone();
    crate::ipc::blocking("get_terminal_cwd", move || {
        // Copy what we need and release the global lock before touching /proc.
        let (pid, sandboxed, path_map) = {
            let state_lock = state
                .lock()
                .map_err(|e| format!("Failed to lock state: {}", e))?;
            let session = state_lock
                .pty_sessions
                .get(&session_id)
                .ok_or_else(|| format!("Session not found: {}", session_id))?;
            // PID of the child process (shell or bwrap wrapper)
            let pid = session
                .child
                .process_id()
                .ok_or_else(|| "Failed to get process ID".to_string())?;
            let path_map = state_lock
                .workspace_context
                .as_ref()
                .map(|ctx| ctx.path_map.clone());
            (pid, session.sandboxed, path_map)
        };
        process_cwd(pid, sandboxed, path_map.as_ref())
    })
    .await
}

#[allow(unused_variables)]
fn process_cwd(
    pid: u32,
    sandboxed: bool,
    path_map: Option<&std::collections::HashMap<String, String>>,
) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        // When sandboxed, the child PID is bwrap, not the shell.
        // Find the shell by looking for bwrap's child process.
        let target_pid = if sandboxed {
            find_child_pid(pid).unwrap_or(pid)
        } else {
            pid
        };

        // On Linux, read /proc/[pid]/cwd symlink
        let cwd_link = format!("/proc/{}/cwd", target_pid);
        let real_path = fs::read_link(&cwd_link)
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to read cwd from /proc: {}", e))?;

        // If workspace is active, translate real path to workspace-relative symlink path
        match path_map {
            Some(map) => Ok(crate::workspace::manager::translate_path(&real_path, map)),
            None => Ok(real_path),
        }
    }

    #[cfg(target_os = "windows")]
    {
        use sysinfo::{Pid, System, ProcessRefreshKind, UpdateKind, ProcessesToUpdate};
        let mut system = System::new();
        let refresh = ProcessRefreshKind::nothing()
            .with_cwd(UpdateKind::Always)
;

        system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[Pid::from_u32(pid)]),
            false,
            refresh,
        );

        // Query CWD directly — PowerShell's prompt function syncs OS-level CWD
        if let Some(process) = system.process(Pid::from_u32(pid)) {
            if let Some(cwd) = process.cwd() {
                Ok(cwd.to_string_lossy().to_string())
            } else {
                Err("Could not get process CWD".to_string())
            }
        } else {
            Err(format!("Process {} not found", pid))
        }
    }

    #[cfg(target_os = "macos")]
    {
        use sysinfo::{Pid, System, ProcessRefreshKind, UpdateKind, ProcessesToUpdate};
        let mut system = System::new();
        let refresh = ProcessRefreshKind::nothing()
            .with_cwd(UpdateKind::Always);

        system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[Pid::from_u32(pid)]),
            false,
            refresh,
        );

        if let Some(process) = system.process(Pid::from_u32(pid)) {
            if let Some(cwd) = process.cwd() {
                Ok(cwd.to_string_lossy().to_string())
            } else {
                Err("Could not get process CWD".to_string())
            }
        } else {
            Err(format!("Process {} not found", pid))
        }
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        Err("Getting terminal cwd is not supported on this platform".to_string())
    }
}
