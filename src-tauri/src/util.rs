//! Small helpers shared across the backend: the home and ~/.lirah folders,
//! the user's shell, and running a command for its output.

use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};

/// Set when Lirah forced `GTK_IM_MODULE` for its own webview (see `run`). The
/// override is ours, not the user's, so shells must not inherit it — GTK apps
/// launched from them would lose IBus.
pub static FORCED_SIMPLE_IM: AtomicBool = AtomicBool::new(false);

/// Strip env Lirah set only for itself from a child shell's command.
pub fn strip_app_env(cmd: &mut portable_pty::CommandBuilder) {
    if FORCED_SIMPLE_IM.load(Ordering::Relaxed) {
        cmd.env_remove("GTK_IM_MODULE");
    }
}

/// A `Command` that opens no console window on Windows (`CREATE_NO_WINDOW`).
/// Every process the backend starts must be built with this, or each spawn
/// flashes a console. Elsewhere it is plain `Command::new`.
pub fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000);
    cmd
}

/// The user's home folder.
pub fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

/// The home folder as a string, for command-line arguments and cwd fallbacks.
pub fn home_dir_string() -> Option<String> {
    home_dir().map(|p| p.to_string_lossy().into_owned())
}

/// ~/.lirah, where Lirah keeps its own files.
pub fn lirah_dir() -> Option<PathBuf> {
    home_dir().map(|h| h.join(".lirah"))
}

/// The user's configured shell, falling back to bash.
#[cfg(unix)]
pub fn user_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

#[cfg(windows)]
pub fn user_shell() -> String {
    "powershell.exe".to_string()
}

/// The hook command that runs a Node script: `node "<path>"`. Works in the
/// shells Claude Code runs hooks with on every platform, unlike a shebang.
pub fn node_command(script: &std::path::Path) -> String {
    format!("node \"{}\"", script.to_string_lossy())
}

/// "powershell" when the terminal shell is PowerShell, else "posix".
pub fn shell_kind() -> &'static str {
    if user_shell().to_lowercase().contains("powershell") { "powershell" } else { "posix" }
}

/// `script` run by the user's login shell (`$SHELL -lc script`; PowerShell on
/// Windows, which has no `-l`), so it sees the same PATH as their terminal.
/// The caller adds cwd, env and stdio.
pub fn login_shell_command(script: &str) -> Command {
    let mut cmd = hidden_command(user_shell());
    if shell_kind() == "powershell" {
        cmd.args(["-NoProfile", "-NoLogo", "-Command", script]);
    } else {
        cmd.args(["-lc", script]);
    }
    if let Some(path) = terminal_path() {
        cmd.env("PATH", path);
    }
    cmd
}

/// The PATH the user's interactive terminal has. A login shell alone misses
/// what rc files add: zsh `-l` skips ~/.zshrc and bash `-l` skips ~/.bashrc,
/// which is where Linux installs usually put ~/.local/bin, nvm and the like.
/// Asked once from an interactive login shell and cached; None when that
/// shell fails or takes too long, so callers keep the inherited PATH.
#[cfg(unix)]
pub fn terminal_path() -> Option<&'static str> {
    static PATH: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    PATH.get_or_init(read_terminal_path).as_deref()
}

#[cfg(windows)]
pub fn terminal_path() -> Option<&'static str> {
    None
}

#[cfg(unix)]
fn read_terminal_path() -> Option<String> {
    use std::io::Read;
    use std::process::Stdio;
    use std::time::{Duration, Instant};

    // Markers fence the value off from anything the rc files print.
    const MARK: &str = "__LIRAH_PATH__";
    let mut child = Command::new(user_shell())
        .args(["-ilc", &format!("printf '{MARK}%s{MARK}' \"$PATH\"")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }

    let mut out = String::new();
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    let start = out.find(MARK)? + MARK.len();
    let len = out[start..].find(MARK)?;
    let path = out[start..start + len].trim();
    (!path.is_empty()).then(|| path.to_string())
}

/// Run `cmd` to completion. Ok(stdout) when it succeeds; otherwise Err with
/// what it printed: stdout, or stderr when stdout is empty, since CLIs differ
/// in where they report errors. A command that can't start is an Err too.
pub fn run_capture(cmd: &mut Command) -> Result<String, String> {
    let output = cmd.output().map_err(|e| format!("Failed to start: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if output.status.success() {
        return Ok(stdout);
    }
    if !stdout.is_empty() {
        return Err(stdout);
    }
    Err(String::from_utf8_lossy(&output.stderr).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hidden_command_runs_and_captures_output() {
        #[cfg(windows)]
        let mut cmd = hidden_command("cmd");
        #[cfg(windows)]
        cmd.args(["/C", "echo", "hi"]);
        #[cfg(not(windows))]
        let mut cmd = hidden_command("sh");
        #[cfg(not(windows))]
        cmd.args(["-c", "echo hi"]);
        assert_eq!(run_capture(&mut cmd).unwrap().trim(), "hi");
    }

    #[test]
    fn shell_kind_matches_the_platform() {
        assert_eq!(shell_kind(), if cfg!(windows) { "powershell" } else { "posix" });
    }

    #[test]
    fn login_shell_command_uses_the_flags_of_its_shell() {
        let args: Vec<_> = login_shell_command("echo hi").get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        let want: &[&str] = if cfg!(windows) { &["-NoProfile", "-NoLogo", "-Command", "echo hi"] } else { &["-lc", "echo hi"] };
        assert_eq!(args, want);
    }

    #[test]
    fn hidden_command_reports_a_missing_program() {
        assert!(run_capture(&mut hidden_command("lirah-no-such-program")).is_err());
    }
}
