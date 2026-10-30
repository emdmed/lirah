use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::Read;
use std::panic::{self, AssertUnwindSafe};
use std::sync::mpsc::{self, Sender};
use std::sync::OnceLock;
use std::thread;
use crate::pty::session::SessionHandle;

type SpawnResult = Result<(SessionHandle, Box<dyn Read + Send>), String>;
type SpawnJob = Box<dyn FnOnce() + Send>;

/// The one thread every PTY child is forked from. It never exits.
///
/// bwrap's `--die-with-parent` is PR_SET_PDEATHSIG, which fires when the
/// *thread* that forked it exits, not the process. Forked from a tokio
/// blocking-pool thread, the sandbox was SIGKILLed as soon as the pool reaped
/// that thread after ~10 s idle — e.g. while lazygit is fullscreen and the
/// tab's pollers stop — and the main terminal showed "[Process exited]".
fn spawner() -> &'static Sender<SpawnJob> {
    static SPAWNER: OnceLock<Sender<SpawnJob>> = OnceLock::new();
    SPAWNER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<SpawnJob>();
        thread::Builder::new()
            .name("pty-spawner".into())
            .spawn(move || {
                while let Ok(job) = rx.recv() {
                    // A panicking spawn must not take this thread down: every
                    // sandbox forked from it would be killed along with it.
                    let _ = panic::catch_unwind(AssertUnwindSafe(job));
                }
            })
            .expect("failed to start pty-spawner thread");
        tx
    })
}

/// Spawn the user's shell on a new PTY. Returns the session and the reader for
/// its output, which the caller drains on its own thread. Blocks until the
/// spawner thread has forked the child, so call it from a blocking thread.
///
/// `env` is set on the shell inside the sandbox too (bwrap clears the rest).
pub fn spawn_pty(rows: u16, cols: u16, sandbox: bool, sandbox_no_net: bool, project_dir: Option<String>, env: Vec<(String, String)>) -> SpawnResult {
    let (tx, rx) = mpsc::channel();
    spawner()
        .send(Box::new(move || {
            let _ = tx.send(spawn_pty_here(rows, cols, sandbox, sandbox_no_net, project_dir, env));
        }))
        .map_err(|_| "PTY spawner thread is gone".to_string())?;
    rx.recv().map_err(|_| "PTY spawn panicked".to_string())?
}

/// Home paths bound read-only inside the sandbox (relative to $HOME), so a
/// sandboxed agent can't plant keys, shell startup code or autostart entries.
const PROTECTED_PATHS: &[&str] = &[
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
    // The `lirah` CLI, which unsandboxed tabs run too
    ".lirah/bin",
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

/// Env vars re-exported into the sandbox after `--clearenv` (when set).
const PASSTHROUGH_VARS: &[&str] = &[
    "HOME", "USER", "LOGNAME", "PATH", "SHELL", "TERM",
    "LANG", "LC_ALL", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
    "DISPLAY", "WAYLAND_DISPLAY",
    // Claude Code / Node.js needs
    "NODE_HOME", "NVM_DIR", "npm_config_prefix",
    // API keys Claude Code needs to function
    "ANTHROPIC_API_KEY", "CLAUDE_API_KEY",
];

/// Namespaces always unshared (net is separate: see `net_isolated`).
const UNSHARED: &[&str] = &["uts", "ipc", "pid", "cgroup"];

/// What the bwrap sandbox looks like for a tab. The bwrap args are built from
/// this, and the UI reads it (get_sandbox_spec) to draw the sandbox.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SandboxSpec {
    /// `/` is bound read-only.
    pub ro_root: bool,
    /// Writable binds, in order: home, then the project dir (if it exists).
    pub writable: Vec<String>,
    /// Absolute paths under home re-bound read-only (only ones that exist).
    pub protected: Vec<String>,
    /// /tmp is a private tmpfs.
    pub tmp_private: bool,
    /// Env is cleared; only `env_passthrough` (when set) and the tab's own vars come back.
    pub cleared_env: bool,
    /// Names (never values) of host env vars re-exported when set.
    pub env_passthrough: Vec<String>,
    /// Namespaces unshared besides net, e.g. ["uts", "ipc", "pid", "cgroup"].
    pub unshare: Vec<String>,
    /// Network namespace unshared (no network).
    pub net_isolated: bool,
}

pub fn sandbox_spec(home: Option<&str>, project_dir: Option<&str>, no_net: bool) -> SandboxSpec {
    let mut writable = Vec::new();
    let mut protected = Vec::new();
    if let Some(home) = home {
        writable.push(home.to_string());
        for subpath in PROTECTED_PATHS {
            let full = format!("{}/{}", home, subpath);
            if std::path::Path::new(&full).exists() {
                protected.push(full);
            }
        }
    }
    // Writable: project directory (may be outside home)
    if let Some(proj) = project_dir {
        if std::path::Path::new(proj).is_dir() {
            writable.push(proj.to_string());
        }
    }
    SandboxSpec {
        ro_root: true,
        writable,
        protected,
        tmp_private: true,
        cleared_env: true,
        env_passthrough: PASSTHROUGH_VARS.iter().map(|v| v.to_string()).collect(),
        unshare: UNSHARED.iter().map(|v| v.to_string()).collect(),
        net_isolated: no_net,
    }
}

/// bwrap args for `spec`, up to (not including) `-- <shell>`. `env` is the
/// tab's own vars, set after the passthrough ones.
fn bwrap_args(spec: &SandboxSpec, env: &[(String, String)]) -> Vec<String> {
    let mut a: Vec<String> = Vec::new();
    let mut push = |xs: &[&str]| a.extend(xs.iter().map(|x| x.to_string()));
    // Clear all inherited env vars to prevent leaking secrets
    if spec.cleared_env {
        push(&["--clearenv"]);
    }
    if spec.ro_root {
        push(&["--ro-bind", "/", "/"]);
    }
    push(&["--dev", "/dev"]);
    if spec.tmp_private {
        push(&["--tmpfs", "/tmp"]);
    }
    // Home is the first writable bind, then the read-only protected paths
    // over it, then the project dir (which may be outside home).
    let mut writable = spec.writable.iter();
    if let Some(home) = writable.next() {
        push(&["--bind", home, home]);
    }
    for full in &spec.protected {
        push(&["--ro-bind", full, full]);
    }
    for dir in writable {
        push(&["--bind", dir, dir]);
    }
    if spec.net_isolated {
        push(&["--unshare-net"]);
    }
    for ns in &spec.unshare {
        push(&[&format!("--unshare-{}", ns)]);
    }
    push(&[
        // NOTE: deliberately no --new-session. It calls setsid() inside the
        // sandbox, and bwrap never re-acquires a controlling terminal
        // afterwards (no TIOCSCTTY), so the sandboxed shell ends up holding
        // the pty slave as plain stdio with tty_nr=0 / tpgid=-1. The kernel
        // then has no foreground process group to signal, so TIOCSWINSZ on
        // the master — every resize_pty call — delivers SIGWINCH to nobody:
        // a running TUI (Claude Code, vim) never learns the terminal got
        // wider and keeps repainting at the old geometry.
        // Its purpose is blocking TIOCSTI input injection, which buys
        // nothing here: the pty is dedicated to this session and the
        // sandboxed process already owns both ends of it, and TIOCSTI is
        // disabled kernel-wide since Linux 6.2 (dev.tty.legacy_tiocsti=0).
        "--die-with-parent",
        // Mount /proc after --unshare-pid so it's scoped to sandbox PIDs
        "--proc", "/proc",
    ]);
    // Re-export only essential env vars
    for var in &spec.env_passthrough {
        if let Ok(val) = std::env::var(var) {
            push(&["--setenv", var, &val]);
        }
    }
    for (key, val) in env {
        push(&["--setenv", key, val]);
    }
    a
}

/// The sandbox a tab would get for `project_dir`, for the UI to draw.
#[tauri::command]
pub fn get_sandbox_spec(project_dir: Option<String>, no_net: bool) -> SandboxSpec {
    sandbox_spec(crate::util::home_dir_string().as_deref(), project_dir.as_deref(), no_net)
}

fn spawn_pty_here(rows: u16, cols: u16, sandbox: bool, sandbox_no_net: bool, project_dir: Option<String>, env: Vec<(String, String)>) -> SpawnResult {
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
    let shell = crate::util::user_shell();

    // Create command: wrap in bwrap sandbox on Unix if requested
    #[cfg(target_os = "linux")]
    let mut cmd = if sandbox {
        let spec = sandbox_spec(crate::util::home_dir_string().as_deref(), project_dir.as_deref(), sandbox_no_net);
        let mut c = CommandBuilder::new("/usr/bin/bwrap");
        c.args(bwrap_args(&spec, &env));
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
    crate::util::strip_app_env(&mut cmd);
    cmd.env("TERM", "xterm-256color");
    for (key, val) in &env {
        cmd.env(key, val);
    }

    let start_dir = project_dir
        .as_ref()
        .filter(|p| std::path::Path::new(p).is_dir())
        .cloned()
        .unwrap_or_else(|| crate::util::home_dir_string().unwrap_or_else(|| {
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
                crate::util::strip_app_env(&mut fallback);
                fallback.env("TERM", "xterm-256color");
                for (key, val) in &env {
                    fallback.env(key, val);
                }
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

    SessionHandle::new(pty_pair.master, child, actually_sandboxed)
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


