//! Small helpers shared across the backend: the home and ~/.lirah folders,
//! the user's shell, and running a command for its output.

use std::path::PathBuf;
use std::process::Command;

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

/// `script` run by the user's login shell (`$SHELL -lc script`), so it sees
/// the same PATH as their terminal. The caller adds cwd, env and stdio.
pub fn login_shell_command(script: &str) -> Command {
    let mut cmd = Command::new(user_shell());
    cmd.args(["-lc", script]);
    cmd
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
