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

    // Determine the shell to use based on the platform
    let shell = get_shell();

    // Create command for the shell
    let mut cmd = CommandBuilder::new(&shell);

    // Start as login shell on Unix only
    #[cfg(unix)]
    cmd.arg("-l");

    cmd.cwd(home_dir().unwrap_or_else(|| {
        #[cfg(unix)]
        { "/".to_string() }
        #[cfg(windows)]
        { "C:\\".to_string() }
    }));

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

fn home_dir() -> Option<String> {
    #[cfg(unix)]
    { std::env::var("HOME").ok() }
    #[cfg(windows)]
    { std::env::var("USERPROFILE").ok() }
}

#[cfg(unix)]
fn get_shell() -> String {
    "/bin/bash".to_string()
}

#[cfg(windows)]
fn get_shell() -> String {
    "powershell.exe".to_string()
}
