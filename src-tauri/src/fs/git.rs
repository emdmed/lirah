use std::fs;
use std::path::PathBuf;
use std::collections::HashMap;
use std::process::Command;
use serde::Serialize;
use crate::state::AppState;

#[derive(Serialize, Clone, Debug)]
pub struct GitStats {
    pub added: usize,
    pub deleted: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>, // "untracked", "deleted", or None for modified
}

#[derive(Serialize)]
pub struct GitDiffResult {
    pub file_path: String,
    pub old_content: String,
    pub new_content: String,
    pub added_lines: usize,
    pub deleted_lines: usize,
    pub is_new_file: bool,
    pub is_deleted_file: bool,
}

/// Find the git repository root by walking up the directory tree
fn find_git_root(start_path: &PathBuf) -> Option<PathBuf> {
    let mut current = start_path.clone();
    loop {
        let git_dir = current.join(".git");
        if git_dir.exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn get_git_diff_stats(repo_path: &PathBuf) -> Result<HashMap<String, GitStats>, String> {
    let git_root = match find_git_root(repo_path) {
        Some(root) => root,
        None => return Ok(HashMap::new()),
    };

    let mut stats_map = HashMap::new();

    // Run: git diff HEAD --numstat for modified files
    let output = Command::new("git")
        .arg("diff")
        .arg("HEAD")
        .arg("--numstat")
        .current_dir(&git_root)
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() != 3 {
                continue;
            }

            let added = parts[0].parse::<usize>().unwrap_or(0);
            let deleted = parts[1].parse::<usize>().unwrap_or(0);
            let relative_path = parts[2];

            // Convert relative path to absolute (relative to git root)
            let absolute_path = git_root.join(relative_path);
            let absolute_path_str = absolute_path.to_string_lossy().to_string();

            // Check if this is a deleted file (file no longer exists)
            let status = if !absolute_path.exists() {
                Some("deleted".to_string())
            } else {
                None
            };

            stats_map.insert(absolute_path_str, GitStats { added, deleted, status });
        }
    }

    // Get untracked files using git ls-files --others --exclude-standard
    let untracked_output = Command::new("git")
        .arg("ls-files")
        .arg("--others")
        .arg("--exclude-standard")
        .current_dir(&git_root)
        .output()
        .map_err(|e| format!("Failed to execute git ls-files command: {}", e))?;

    if untracked_output.status.success() {
        let stdout = String::from_utf8_lossy(&untracked_output.stdout);

        for relative_path in stdout.lines() {
            if relative_path.is_empty() {
                continue;
            }

            let absolute_path = git_root.join(relative_path);
            let absolute_path_str = absolute_path.to_string_lossy().to_string();

            // Skip if already in stats (shouldn't happen, but be safe)
            if stats_map.contains_key(&absolute_path_str) {
                continue;
            }

            // Count lines in the untracked file
            let line_count = if absolute_path.is_file() {
                fs::read_to_string(&absolute_path)
                    .map(|content| content.lines().count())
                    .unwrap_or(0)
            } else {
                0
            };

            stats_map.insert(absolute_path_str, GitStats {
                added: line_count,
                deleted: 0,
                status: Some("untracked".to_string()),
            });
        }
    }

    Ok(stats_map)
}

#[tauri::command]
pub fn get_git_stats(path: Option<String>, state: tauri::State<AppState>) -> Result<HashMap<String, GitStats>, String> {
    let repo_path = if let Some(p) = path {
        PathBuf::from(p)
    } else {
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?
    };

    // Canonicalize path for consistent cache keys
    let canonical_path = repo_path.canonicalize()
        .unwrap_or_else(|_| repo_path.clone());

    // Try cache first
    {
        let state_lock = state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?;

        if let Some(cached_stats) = state_lock.git_cache.get(&canonical_path) {
            // Clone from Arc - cheap if caller just reads, necessary for Tauri serialization
            return Ok((*cached_stats).clone());
        }
    }

    // Cache miss - run git diff
    let stats = get_git_diff_stats(&repo_path)?;

    // Store in cache and setup watcher
    {
        let state_lock = state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?;

        state_lock.git_cache.set(canonical_path.clone(), stats.clone());

        // Try to setup watcher (best-effort, ignore errors)
        let _ = state_lock.git_cache.setup_watcher(canonical_path);
    }

    Ok(stats)
}

#[tauri::command]
pub fn enable_file_watchers(state: tauri::State<AppState>) -> Result<(), String> {
    let state_lock = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    state_lock.git_cache.enable_watchers();
    Ok(())
}

#[tauri::command]
pub fn disable_file_watchers(state: tauri::State<AppState>) -> Result<(), String> {
    let state_lock = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    state_lock.git_cache.disable_watchers();
    Ok(())
}

#[tauri::command]
pub fn get_file_watchers_status(state: tauri::State<AppState>) -> Result<bool, String> {
    let state_lock = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    Ok(state_lock.git_cache.is_enabled())
}

#[tauri::command]
pub fn get_git_diff(file_path: String, repo_path: String) -> Result<GitDiffResult, String> {
    let repo = PathBuf::from(&repo_path);
    let file = PathBuf::from(&file_path);

    // Check if .git directory exists
    let git_dir = repo.join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }

    // Calculate relative path from repo root
    let relative_path = if file.starts_with(&repo) {
        file.strip_prefix(&repo)
            .map_err(|e| format!("Failed to get relative path: {}", e))?
            .to_string_lossy()
            .to_string()
    } else {
        file_path.clone()
    };

    // Get old content from git (HEAD version)
    let old_output = Command::new("git")
        .arg("show")
        .arg(format!("HEAD:{}", relative_path))
        .current_dir(&repo)
        .output()
        .map_err(|e| format!("Failed to execute git show: {}", e))?;

    let is_new_file = !old_output.status.success();
    let old_content = if is_new_file {
        String::new()
    } else {
        String::from_utf8_lossy(&old_output.stdout).to_string()
    };

    // Get new content from disk (current working tree)
    let new_content = if file.exists() {
        fs::read_to_string(&file)
            .map_err(|e| format!("Failed to read file: {}", e))?
    } else {
        String::new()
    };

    let is_deleted_file = !file.exists() && !is_new_file;

    // Count changes using git diff --numstat
    let numstat_output = Command::new("git")
        .arg("diff")
        .arg("HEAD")
        .arg("--numstat")
        .arg("--")
        .arg(&relative_path)
        .current_dir(&repo)
        .output()
        .map_err(|e| format!("Failed to execute git diff: {}", e))?;

    let numstat = String::from_utf8_lossy(&numstat_output.stdout);
    let (added_lines, deleted_lines) = numstat
        .lines()
        .next()
        .map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                let added = parts[0].parse::<usize>().unwrap_or(0);
                let deleted = parts[1].parse::<usize>().unwrap_or(0);
                (added, deleted)
            } else {
                (0, 0)
            }
        })
        .unwrap_or((0, 0));

    Ok(GitDiffResult {
        file_path,
        old_content,
        new_content,
        added_lines,
        deleted_lines,
        is_new_file,
        is_deleted_file,
    })
}
