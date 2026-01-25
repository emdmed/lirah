use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use crate::state::AppState;
use walkdir::WalkDir;
use std::collections::{HashSet, HashMap};
use std::process::Command;

#[derive(Serialize)]
pub struct DirectoryEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
pub struct RecursiveDirectoryEntry {
    name: String,
    path: String,
    is_dir: bool,
    depth: usize,
    parent_path: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct GitStats {
    pub added: usize,
    pub deleted: usize,
}

#[tauri::command]
pub fn read_directory(path: Option<String>) -> Result<Vec<DirectoryEntry>, String> {
    let dir_path = if let Some(p) = path {
        PathBuf::from(p)
    } else {
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?
    };

    let entries = fs::read_dir(&dir_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut result = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();

        result.push(DirectoryEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
        });
    }

    // Sort: directories first, then files, both alphabetically
    result.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(result)
}

#[tauri::command]
pub fn get_terminal_cwd(session_id: String, state: tauri::State<AppState>) -> Result<String, String> {
    let state_lock = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let session = state_lock
        .pty_sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    // Get the PID of the child process (shell)
    let pid = session.child.process_id()
        .ok_or_else(|| "Failed to get process ID".to_string())?;

    #[cfg(target_os = "linux")]
    {
        // On Linux, read /proc/[pid]/cwd symlink
        let cwd_link = format!("/proc/{}/cwd", pid);
        fs::read_link(&cwd_link)
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to read cwd from /proc: {}", e))
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Getting terminal cwd is only supported on Linux".to_string())
    }
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn read_directory_recursive(
    path: Option<String>,
    max_depth: Option<usize>,
    max_files: Option<usize>
) -> Result<Vec<RecursiveDirectoryEntry>, String> {
    let root_path = if let Some(p) = path {
        PathBuf::from(p)
    } else {
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?
    };

    let max_depth = max_depth.unwrap_or(10);
    let max_files = max_files.unwrap_or(10000);

    // Directories to ignore
    let ignore_dirs: HashSet<&str> = [
        ".git",
        "node_modules",
        "target",
        "dist",
        "build",
        ".cache",
        ".next",
        ".nuxt",
        "__pycache__",
        ".venv",
        "venv",
    ]
    .iter()
    .copied()
    .collect();

    let mut entries = Vec::new();
    let root_path_str = root_path.to_string_lossy().to_string();

    // Walk directory tree
    for entry in WalkDir::new(&root_path)
        .max_depth(max_depth)
        .follow_links(false) // Don't follow symlinks
        .into_iter()
        .filter_entry(|e| {
            // Skip ignored directories
            if e.file_type().is_dir() {
                if let Some(name) = e.file_name().to_str() {
                    return !ignore_dirs.contains(name);
                }
            }
            true
        })
    {
        // Check if we've reached the file limit
        if entries.len() >= max_files {
            eprintln!("Warning: Reached max file limit of {}", max_files);
            break;
        }

        match entry {
            Ok(e) => {
                // Skip the root directory itself
                if e.path() == root_path {
                    continue;
                }

                // Skip symlinks
                if e.path_is_symlink() {
                    continue;
                }

                let path = e.path();
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Unknown")
                    .to_string();

                let path_str = path.to_string_lossy().to_string();

                // Calculate parent path
                let parent_path = path
                    .parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| root_path_str.clone());

                let is_dir = e.file_type().is_dir();
                let depth = e.depth();

                entries.push(RecursiveDirectoryEntry {
                    name,
                    path: path_str,
                    is_dir,
                    depth,
                    parent_path,
                });
            }
            Err(err) => {
                // Log error but continue processing
                eprintln!("Warning: Failed to read entry: {}", err);
            }
        }
    }

    // Sort: directories first, then files, both alphabetically
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

fn get_git_diff_stats(repo_path: &PathBuf) -> Result<HashMap<String, GitStats>, String> {
    // Check if .git directory exists
    let git_dir = repo_path.join(".git");
    if !git_dir.exists() {
        return Ok(HashMap::new());
    }

    // Run: git diff HEAD --numstat
    let output = Command::new("git")
        .arg("diff")
        .arg("HEAD")
        .arg("--numstat")
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    if !output.status.success() {
        eprintln!("Git diff command failed: {}", String::from_utf8_lossy(&output.stderr));
        return Ok(HashMap::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut stats_map = HashMap::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() != 3 {
            continue;
        }

        let added = parts[0].parse::<usize>().unwrap_or(0);
        let deleted = parts[1].parse::<usize>().unwrap_or(0);
        let relative_path = parts[2];

        // Convert relative path to absolute
        let absolute_path = repo_path.join(relative_path);
        let absolute_path_str = absolute_path.to_string_lossy().to_string();

        stats_map.insert(absolute_path_str, GitStats { added, deleted });
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
            return Ok(cached_stats);
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
pub fn check_command_exists(command: String) -> Result<bool, String> {
    #[cfg(target_family = "unix")]
    let checker = "which";

    #[cfg(target_family = "windows")]
    let checker = "where";

    let output = Command::new(checker)
        .arg(&command)
        .output()
        .map_err(|e| format!("Failed to check command: {}", e))?;

    Ok(output.status.success())
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
