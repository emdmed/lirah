//! Git commands for the frontend: the committable files, any git command
//! (lib/git.js wraps it), and an agent-written commit message for what's staged.

use super::git::git_command;
use std::path::Path;

#[tauri::command]
pub async fn get_committable_files(repo_path: String) -> Result<Vec<serde_json::Value>, String> {
    crate::ipc::blocking("get_committable_files", move || {
        let output = git_command(Path::new(&repo_path))
            .args(["status", "--porcelain"])
            .output()
            .map_err(|e| format!("Failed to run git status: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut files = Vec::new();

        for line in stdout.lines() {
            if line.len() < 4 {
                continue;
            }
            let status_code = &line[0..2];
            let path = line[3..].trim().to_string();

            // Determine status label
            let status = match status_code.trim() {
                "M" | "MM" | "AM" => "modified",
                "A" => "added",
                "D" => "deleted",
                "R" | "RM" => "renamed",
                "??" => "untracked",
                _ => "modified",
            };

            files.push(serde_json::json!({ "path": path, "status": status }));
        }

        Ok(files)
    })
    .await
}

#[tauri::command]
pub async fn run_git_command(repo_path: String, args: Vec<String>) -> Result<String, String> {
    crate::ipc::blocking("run_git_command", move || {
        let output = git_command(Path::new(&repo_path))
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to run git: {}", e))?;

        // A failure counts only when git says why on stderr. Some failures exit
        // non-zero silently (`merge-base --is-ancestor`, `rev-parse --verify
        // --quiet`, a conflicted merge), and callers read the outcome from the
        // output or the repo state instead: see src/lib/git.js.
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if !stderr.is_empty() {
                return Err(stderr);
            }
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    })
    .await
}

const DEFAULT_PROMPT: &str = "Generate a concise conventional commit message for this diff. Reply with ONLY the commit message, no explanation, no markdown formatting, no backticks:";

#[tauri::command]
pub async fn generate_commit_message(
    project_dir: String,
    cli: String,
    custom_prompt: Option<String>,
) -> Result<String, String> {
    crate::ipc::blocking("generate_commit_message", move || {
        // Get staged diff using git diff --cached via shell command
        let diff_output = git_command(Path::new(&project_dir))
            .args(["diff", "--cached", "--no-color"])
            .output()
            .map_err(|e| format!("Failed to run git diff: {}", e))?;

        if !diff_output.status.success() {
            let stderr = String::from_utf8_lossy(&diff_output.stderr).to_string();
            return Err(format!("git diff failed: {}", stderr));
        }

        let diff = String::from_utf8_lossy(&diff_output.stdout);

        if diff.trim().is_empty() {
            return Err("No staged changes found. Please stage files first.".to_string());
        }

        // Build the prompt
        let base_prompt = custom_prompt
            .as_ref()
            .map(|p| {
                format!(
                    "{}\n\nAdditional instructions: {}",
                    DEFAULT_PROMPT,
                    p.trim()
                )
            })
            .unwrap_or_else(|| DEFAULT_PROMPT.to_string());

        // Truncate diff if too large (keep it under ~100KB for safety)
        let max_diff_size = 100_000;
        let truncated_diff = if diff.len() > max_diff_size {
            format!(
                "{}\n\n... (diff truncated, showing first {} characters)",
                &diff[..max_diff_size],
                max_diff_size
            )
        } else {
            diff.to_string()
        };

        let full_prompt = format!("{}\n\n{}", base_prompt, truncated_diff);
        let escaped_prompt = full_prompt.replace('\'', "'\\''");

        // Try with free model first
        let (command, fallback_command) = match cli.as_str() {
            "opencode" => (
                format!("opencode run -m opencode/glm-5-free '{}'", escaped_prompt),
                Some(format!(
                    "opencode run -m opencode/minimax '{}'",
                    escaped_prompt
                )),
            ),
            "claude" | "claude-code" => (
                format!("claude --model sonnet --print '{}'", escaped_prompt),
                None,
            ),
            _ => (
                format!("claude --model sonnet --print '{}'", escaped_prompt),
                None,
            ),
        };

        let run = |script: &str| {
            crate::util::run_capture(
                crate::util::login_shell_command(script)
                    .current_dir(&project_dir)
                    .env("TERM", "xterm-256color"),
            )
            .map(|out| out.trim().to_string())
            .map_err(|e| format!("LLM command failed: {}", e))
        };

        // First attempt with the free model; if it fails and there is a fallback
        // (paid model), try that silently and report its error instead.
        match (run(&command), fallback_command) {
            (Ok(out), _) => Ok(out),
            (Err(_), Some(fallback)) => run(&fallback),
            (Err(e), None) => Err(e),
        }
    })
    .await
}
