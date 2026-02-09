use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use crate::state::PtySession;

pub fn spawn_pty(rows: u16, cols: u16, sandbox: bool, project_dir: Option<String>) -> Result<PtySession, String> {
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

    // Create command: wrap in bwrap sandbox on Unix if requested
    #[cfg(unix)]
    let mut cmd = if sandbox {
        let mut c = CommandBuilder::new("bwrap");
        c.args(&[
            "--ro-bind", "/", "/",
            "--dev", "/dev",
            "--proc", "/proc",
            "--tmpfs", "/tmp",
        ]);
        // Home read-only, with specific writable paths
        if let Some(ref home) = home_dir() {
            c.args(&["--ro-bind", home, home]);
            // Writable: Claude config
            let claude_dir = format!("{}/.claude", home);
            if std::path::Path::new(&claude_dir).exists() {
                c.args(&["--bind", &claude_dir, &claude_dir]);
            }
            // Writable: app configs
            let config_dir = format!("{}/.config", home);
            if std::path::Path::new(&config_dir).exists() {
                c.args(&["--bind", &config_dir, &config_dir]);
            }
        }
        // Writable: project directory
        if let Some(ref proj) = project_dir {
            c.args(&["--bind", proj, proj]);
        }
        c.args(&[
            "--unshare-pid",
            "--unshare-uts",
            "--unshare-ipc",
            "--die-with-parent",
            "--", &shell, "-l",
        ]);
        c
    } else {
        let mut c = CommandBuilder::new(&shell);
        c.arg("-l");
        c
    };

    #[cfg(not(unix))]
    let mut cmd = CommandBuilder::new(&shell);

    // On Windows, PowerShell's Set-Location (cd) doesn't call Win32 SetCurrentDirectory,
    // so the OS-level CWD never updates. Override the prompt function to sync them,
    // allowing sysinfo to read the actual CWD.
    #[cfg(windows)]
    {
        cmd.arg("-NoExit");
        cmd.arg("-Command");
        cmd.arg("function prompt { [System.IO.Directory]::SetCurrentDirectory($PWD.Path); \"PS $($PWD.Path)> \" }");
    }

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
        sandboxed: sandbox,
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
