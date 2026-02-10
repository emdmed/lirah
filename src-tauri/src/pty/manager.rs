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
    #[cfg(target_os = "linux")]
    let mut cmd = if sandbox {
        let mut c = CommandBuilder::new("/usr/bin/bwrap");
        c.args(&[
            "--ro-bind", "/", "/",
            "--dev-bind", "/dev", "/dev",
            "--proc", "/proc",
            "--bind", "/tmp", "/tmp",
        ]);
        // Home directory: read-only base, with specific writable subdirectories.
        // This prevents modification of sensitive files like ~/.bashrc, ~/.ssh/,
        // ~/.gnupg/, ~/.config/autostart/, etc.
        if let Some(ref home) = home_dir() {
            c.args(&["--ro-bind", home, home]);

            // Writable subdirectories that Claude Code needs
            let writable_subdirs = [
                ".claude",
                ".config/claude-code",
                ".cache",
                ".npm",
                ".local/share",
                ".local/state",
                ".nvm",
                ".cargo",
                ".rustup",
                ".bun",
                ".pnpm",
                ".yarn",
            ];
            for subdir in &writable_subdirs {
                let full = format!("{}/{}", home, subdir);
                let path = std::path::Path::new(&full);
                if path.exists() {
                    c.args(&["--bind", &full, &full]);
                }
            }
        }
        // Writable: project directory (may be outside home)
        if let Some(ref proj) = project_dir {
            if std::path::Path::new(proj).is_dir() {
                c.args(&["--bind", proj, proj]);
            }
        }
        c.args(&[
            "--unshare-uts",
            "--die-with-parent",
            "--", &shell, "-l",
        ]);
        c
    } else {
        let mut c = CommandBuilder::new(&shell);
        c.arg("-l");
        c
    };

    #[cfg(all(unix, not(target_os = "linux")))]
    let mut cmd = {
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

    // Set TERM so the shell knows terminal capabilities (line wrapping, cursor movement, etc.)
    cmd.env("TERM", "xterm-256color");

    cmd.cwd(home_dir().unwrap_or_else(|| {
        #[cfg(unix)]
        { "/".to_string() }
        #[cfg(windows)]
        { "C:\\".to_string() }
    }));

    // Spawn the child process
    eprintln!("[sandbox] sandbox={}, project_dir={:?}", sandbox, project_dir);
    #[cfg(target_os = "linux")]
    let (child, actually_sandboxed) = if sandbox {
        // Ensure bwrap AppArmor profile exists on Ubuntu before first attempt
        ensure_bwrap_apparmor();
        match pty_pair.slave.spawn_command(cmd) {
            Ok(child) => (child, true),
            Err(e) => {
                eprintln!("[sandbox] bwrap failed ({}), falling back to unsandboxed", e);
                let mut fallback = CommandBuilder::new(&shell);
                fallback.arg("-l");
                fallback.env("TERM", "xterm-256color");
                fallback.cwd(home_dir().unwrap_or_else(|| "/".to_string()));
                let child = pty_pair.slave.spawn_command(fallback)
                    .map_err(|e| format!("Failed to spawn shell: {}", e))?;
                (child, false)
            }
        }
    } else {
        let child = pty_pair.slave.spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;
        (child, false)
    };
    #[cfg(not(target_os = "linux"))]
    let (child, actually_sandboxed) = {
        let child = pty_pair.slave.spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;
        (child, false)
    };
    eprintln!("[sandbox] spawned pid={:?}, sandboxed={}", child.process_id(), actually_sandboxed);

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
        sandboxed: actually_sandboxed,
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

/// On Ubuntu 24.04+, AppArmor restricts unprivileged user namespaces.
/// bwrap needs a profile that grants `userns,` permission (same as Flatpak).
/// This checks once per process whether the profile exists and installs it via pkexec if needed.
#[cfg(target_os = "linux")]
fn ensure_bwrap_apparmor() {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let profile_path = "/etc/apparmor.d/bwrap";
        let sysctl_path = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns";

        // Only relevant if AppArmor restricts unprivileged userns
        let restricted = std::fs::read_to_string(sysctl_path)
            .map(|v| v.trim() == "1")
            .unwrap_or(false);
        if !restricted {
            eprintln!("[sandbox] AppArmor userns restriction not active, skipping profile setup");
            return;
        }

        // Check if profile already exists
        if std::path::Path::new(profile_path).exists() {
            eprintln!("[sandbox] bwrap AppArmor profile already installed");
            return;
        }

        eprintln!("[sandbox] AppArmor restricts userns; installing bwrap profile via pkexec...");

        let profile_content = r#"abi <abi/4.0>,
include <tunables/global>

profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,
}
"#;

        // Write profile and reload via pkexec (GUI sudo prompt)
        let script = format!(
            "echo '{}' > {} && apparmor_parser -r {}",
            profile_content, profile_path, profile_path
        );
        let status = std::process::Command::new("pkexec")
            .args(["bash", "-c", &script])
            .status();

        match status {
            Ok(s) if s.success() => {
                eprintln!("[sandbox] bwrap AppArmor profile installed successfully");
            }
            Ok(s) => {
                eprintln!("[sandbox] pkexec exited with {}, sandbox may not work", s);
            }
            Err(e) => {
                eprintln!("[sandbox] failed to run pkexec: {}, sandbox may not work", e);
            }
        }
    });
}

fn home_dir() -> Option<String> {
    #[cfg(unix)]
    { std::env::var("HOME").ok() }
    #[cfg(windows)]
    { std::env::var("USERPROFILE").ok() }
}

#[cfg(unix)]
fn get_shell() -> String {
    // Use the user's configured shell, fall back to /bin/bash
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

#[cfg(windows)]
fn get_shell() -> String {
    "powershell.exe".to_string()
}
