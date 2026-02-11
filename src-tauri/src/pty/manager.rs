use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use crate::state::PtySession;

pub fn spawn_pty(rows: u16, cols: u16, sandbox: bool, sandbox_no_net: bool, project_dir: Option<String>) -> Result<PtySession, String> {
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
        // Clear all inherited env vars to prevent leaking secrets
        c.args(&["--clearenv"]);
        c.args(&[
            "--ro-bind", "/", "/",
            "--dev", "/dev",
            "--tmpfs", "/tmp",
        ]);
        // Home directory: writable by default, with sensitive paths read-only
        if let Some(ref home) = home_dir() {
            c.args(&["--bind", home, home]);

            // Sensitive paths that should be read-only inside the sandbox
            let protected_paths = [
                ".ssh",
                ".gnupg",
                ".bashrc",
                ".bash_profile",
                ".profile",
                ".zshrc",
                ".zprofile",
                ".pam_environment",
                ".gitconfig",
                ".config/git",
                ".config/autostart",
                ".config/systemd/user",
                ".config/environment.d",
                ".local/bin",
                // Shell configs
                ".config/fish",
                ".config/nushell",
                // Desktop environment startup scripts
                ".config/plasma-workspace/env",
                ".config/hypr",
                ".xinitrc",
                ".xprofile",
                // File handler and .desktop registration
                ".config/mimeapps.list",
                ".local/share/applications",
            ];
            for subpath in &protected_paths {
                let full = format!("{}/{}", home, subpath);
                if std::path::Path::new(&full).exists() {
                    c.args(&["--ro-bind", &full, &full]);
                }
            }
        }
        // Writable: project directory (may be outside home)
        if let Some(ref proj) = project_dir {
            if std::path::Path::new(proj).is_dir() {
                c.args(&["--bind", proj, proj]);
            }
        }
        if sandbox_no_net {
            c.args(&["--unshare-net"]);
        }
        c.args(&[
            "--unshare-uts",
            "--unshare-ipc",
            "--unshare-pid",
            "--unshare-cgroup",
            "--new-session",
            "--die-with-parent",
            // Mount /proc after --unshare-pid so it's scoped to sandbox PIDs
            "--proc", "/proc",
        ]);
        // Re-export only essential env vars
        let passthrough_vars = [
            "HOME", "USER", "LOGNAME", "PATH", "SHELL", "TERM",
            "LANG", "LC_ALL", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
            "DISPLAY", "WAYLAND_DISPLAY",
            // Claude Code / Node.js needs
            "NODE_HOME", "NVM_DIR", "npm_config_prefix",
            // API keys Claude Code needs to function
            "ANTHROPIC_API_KEY", "CLAUDE_API_KEY",
        ];
        for var in &passthrough_vars {
            if let Ok(val) = std::env::var(var) {
                c.args(&["--setenv", var, &val]);
            }
        }
        c.args(&["--", &shell, "-l"]);
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

    let start_dir = project_dir
        .as_ref()
        .filter(|p| std::path::Path::new(p).is_dir())
        .cloned()
        .unwrap_or_else(|| home_dir().unwrap_or_else(|| {
            #[cfg(unix)]
            { "/".to_string() }
            #[cfg(windows)]
            { "C:\\".to_string() }
        }));
    cmd.cwd(&start_dir);

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
                fallback.cwd(&start_dir);
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
