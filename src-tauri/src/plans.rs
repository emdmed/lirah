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
        let mut child = crate::util::login_shell_command("claude --print --model sonnet --allowedTools Read Grep Glob")
            .current_dir(&project_dir)
            .env("TERM", "xterm-256color")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start claude: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(prompt.as_bytes())
                .map_err(|e| format!("Failed to send the plan to claude: {}", e))?;
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
    })
    .await
}

/// Delete a plan file that was imported out of a repo. Only a `.md` file
/// directly inside `repo_root` qualifies, so a bad path can't reach anything else.
#[tauri::command]
pub async fn delete_plan_file(path: String, repo_root: String) -> Result<(), String> {
    crate::ipc::blocking("delete_plan_file", move || {
        let file = Path::new(&path)
            .canonicalize()
            .map_err(|e| format!("Plan file not found: {}", e))?;
        let root = Path::new(&repo_root)
            .canonicalize()
            .map_err(|e| format!("Repo not found: {}", e))?;
        let is_md = file
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"));
        if !is_md || file.parent() != Some(root.as_path()) || !file.is_file() {
            return Err("Only a .md file at the repo root can be removed".to_string());
        }
        std::fs::remove_file(&file).map_err(|e| format!("Failed to delete plan file: {}", e))
    })
    .await
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
