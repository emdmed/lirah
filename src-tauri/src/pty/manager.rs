use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use crate::state::PtySession;

pub fn spawn_pty(rows: u16, cols: u16) -> Result<PtySession, String> {
    let pty_system = NativePtySystem::default();

    // Create a new PTY with the specified size
    let pty_pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Build platform-specific shell command
    let cmd = build_shell_command();

    // Spawn the child process
    let child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Take writer from master before moving it
    let master = pty_pair.master;
    let writer = master
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    Ok(PtySession {
        master,
        child,
        writer,
        shutdown: Arc::new(AtomicBool::new(false)),
    })
}

pub fn write_to_pty(session: &mut PtySession, data: &str) -> Result<(), String> {
    use std::io::Write;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {}", e))
}

pub fn resize_pty(session: &mut PtySession, rows: u16, cols: u16) -> Result<(), String> {
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {}", e))
}

#[cfg(unix)]
fn build_shell_command() -> CommandBuilder {
    let shell = "/bin/bash".to_string();
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l"); // Start as login shell
    cmd.cwd(std::env::var("HOME").unwrap_or_else(|_| "/".to_string()));
    cmd
}

#[cfg(windows)]
fn build_shell_command() -> CommandBuilder {
    let shell = get_windows_shell();
    let mut cmd = CommandBuilder::new(&shell);

    // Check if using PowerShell (Core or legacy)
    let shell_lower = shell.to_lowercase();
    if shell_lower.contains("pwsh") || shell_lower.contains("powershell") {
        cmd.arg("-NoLogo");
        cmd.arg("-NoExit");
    }
    // For cmd.exe, no special flags needed

    // Use USERPROFILE on Windows (equivalent to $HOME on Unix)
    cmd.cwd(std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string()));
    cmd
}

#[cfg(windows)]
fn get_windows_shell() -> String {
    // Prefer PowerShell Core (pwsh) if available, then legacy PowerShell, then cmd
    if let Ok(path) = std::process::Command::new("where")
        .arg("pwsh.exe")
        .output()
    {
        if path.status.success() {
            return "pwsh.exe".to_string();
        }
    }

    // Fall back to legacy PowerShell or cmd
    std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
}
