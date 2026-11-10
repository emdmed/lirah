use std::io::Write;
use std::path::Path;
use std::process::Stdio;

/// Ask Claude to split a plan into implementation chunks. The prompt (built by
/// the frontend, see src/features/plans/planPrompts.js) goes in on stdin since
/// plans are long, and only read-only tools are allowed: the splitter may look
/// at the code to size the chunks but never touches it. Returns raw stdout;
/// the frontend extracts and validates the JSON.
#[tauri::command]
pub async fn split_plan(project_dir: String, prompt: String) -> Result<String, String> {
    crate::ipc::blocking("split_plan", move || {
        claude_print("claude --print --model sonnet --allowedTools Read Grep Glob", &project_dir, &prompt)
    })
    .await
}

/// Rewrite a task as a user story (prompt from src/features/tasks/taskModel.js).
/// No tools: it only reformats text. Returns raw stdout for the frontend to parse.
#[tauri::command]
pub async fn format_task(project_dir: String, prompt: String) -> Result<String, String> {
    crate::ipc::blocking("format_task", move || {
        claude_print("claude --print --model haiku", &project_dir, &prompt)
    })
    .await
}

/// Summarize the work log (prompt from src/features/worklog/worklogSummary.js)
/// with one of the models the work log pane offers. No tools: text only.
#[tauri::command]
pub async fn summarize_worklog(project_dir: String, prompt: String, model: String) -> Result<String, String> {
    // The model goes into a shell command line, so only these names pass.
    if !matches!(model.as_str(), "haiku" | "sonnet" | "opus") {
        return Err(format!("unknown model: {model}"));
    }
    crate::ipc::blocking("summarize_worklog", move || {
        claude_print(&format!("claude --print --model {model}"), &project_dir, &prompt)
    })
    .await
}

/// Run a headless claude command with `prompt` on stdin; stdout on success.
pub(crate) fn claude_print(cmd: &str, project_dir: &str, prompt: &str) -> Result<String, String> {
    let mut child = crate::util::login_shell_command(cmd)
        .current_dir(project_dir)
        .env("TERM", "xterm-256color")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start claude: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|e| format!("Failed to send the prompt to claude: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("claude failed: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if output.status.success() {
        return Ok(stdout);
    }
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Err(format!(
        "claude failed: {}",
        if stderr.trim().is_empty() { stdout } else { stderr }
    ))
}

/// Delete a plan .md file. Only a `.md` file directly inside a month folder
/// (`~/.lirah/plans/<YYYY-MM>/`) qualifies, so a bad path can't reach anything else.
#[tauri::command]
pub async fn delete_plan_file(path: String) -> Result<(), String> {
    crate::ipc::blocking("delete_plan_file", move || {
        let file = Path::new(&path)
            .canonicalize()
            .map_err(|e| format!("Plan file not found: {}", e))?;
        let plans = crate::util::lirah_dir()
            .ok_or("no home directory")?
            .join("plans")
            .canonicalize()
            .map_err(|e| format!("Plans folder not found: {}", e))?;
        if !is_plan_md(&plans, &file) || !file.is_file() {
            return Err("Only a .md file in ~/.lirah/plans/<YYYY-MM> can be removed".to_string());
        }
        std::fs::remove_file(&file).map_err(|e| format!("Failed to delete plan file: {}", e))
    })
    .await
}

/// `file` is `<plans>/<YYYY-MM>/<name>.md`.
fn is_plan_md(plans: &Path, file: &Path) -> bool {
    let is_md = file.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("md"));
    let Some(month) = file.parent() else { return false };
    let month_ok = month.file_name().and_then(|n| n.to_str()).is_some_and(|n| {
        let b = n.as_bytes();
        b.len() == 7 && b[4] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || c.is_ascii_digit())
    });
    is_md && month_ok && month.parent() == Some(plans)
}

/// Remove a plan's worktree folder (~/.lirah/plan-worktrees/<dir>) once its
/// git worktrees are gone. Anything outside that folder is refused.
#[tauri::command]
pub async fn remove_plan_workdir(path: String) -> Result<(), String> {
    crate::ipc::blocking("remove_plan_workdir", move || {
        let base = crate::util::lirah_dir()
            .ok_or_else(|| "No home directory".to_string())?
            .join("plan-worktrees");
        let dir = match Path::new(&path).canonicalize() {
            Ok(dir) => dir,
            Err(_) => return Ok(()), // Already gone.
        };
        let base = base.canonicalize().map_err(|e| format!("No plan worktrees: {}", e))?;
        if dir.parent() != Some(base.as_path()) || !dir.is_dir() {
            return Err("Only a plan worktree folder can be removed".to_string());
        }
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to remove the plan folder: {}", e))
    })
    .await
}

/// How much of a transcript's tail to scan for the last assistant message.
/// The text of the newest assistant message in a Claude Code transcript
/// (JSONL), so plan auto-pilot can read the `PLAN-STATUS:` line an agent ends
/// on. Only the tail of the file is read; `None` when there is no text there.
#[tauri::command]
pub async fn last_assistant_text(transcript_path: String) -> Result<Option<String>, String> {
    crate::ipc::blocking("last_assistant_text", move || {
        crate::claude::transcript::last_assistant_text(Path::new(&transcript_path))
    })
    .await
}

/// See `transcript::last_interrupt_at`.
#[tauri::command]
pub async fn last_interrupt_at(transcript_path: String) -> Result<Option<String>, String> {
    crate::ipc::blocking("last_interrupt_at", move || {
        crate::claude::transcript::last_interrupt_at(Path::new(&transcript_path))
    })
    .await
}

/// The newest GitHub PR (any state) whose head is `branch`, as gh's JSON list
/// (`[]` when there is none). Runs gh directly with fixed arguments, no shell.
/// Errs when gh is missing, logged out, or the repo has no GitHub remote.
#[tauri::command]
pub async fn gh_pr_for_branch(repo_path: String, branch: String) -> Result<String, String> {
    crate::ipc::blocking("gh_pr_for_branch", move || {
        let mut cmd = crate::util::hidden_command("gh");
        if let Some(path) = crate::util::terminal_path() {
            cmd.env("PATH", path);
        }
        let output = cmd
            .current_dir(&repo_path)
            .args(["pr", "list", "--state", "all", "--limit", "1", "--head", &branch])
            .args(["--json", "number,url,state,createdAt,mergedAt"])
            .output()
            .map_err(|e| format!("Failed to run gh: {}", e))?;
        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }
        Err(format!("gh failed: {}", String::from_utf8_lossy(&output.stderr).trim()))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::is_plan_md;
    use std::path::Path;

    #[test]
    fn only_md_files_in_a_month_folder() {
        let plans = Path::new("/h/.lirah/plans");
        assert!(is_plan_md(plans, Path::new("/h/.lirah/plans/2026-11/x_plan.md")));
        assert!(!is_plan_md(plans, Path::new("/h/.lirah/plans/x_plan.md")));
        assert!(!is_plan_md(plans, Path::new("/h/.lirah/plans/2026-11/p1/plan.md")));
        assert!(!is_plan_md(plans, Path::new("/h/.lirah/plans/2026-11/plan.json")));
        assert!(!is_plan_md(plans, Path::new("/h/.lirah/plans/repo-1234/x.md")));
        assert!(!is_plan_md(plans, Path::new("/r/2026-11/x.md")));
    }
}
