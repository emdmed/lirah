use std::fs;
use std::path::PathBuf;
use std::io::{BufRead, BufReader};
use serde::{Serialize, Deserialize};
use crate::state::AppState;
use walkdir::WalkDir;
use std::collections::{HashSet, HashMap};
use std::process::Command;

fn home_dir() -> Option<String> {
    #[cfg(unix)]
    { std::env::var("HOME").ok() }
    #[cfg(windows)]
    { std::env::var("USERPROFILE").ok() }
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>, // "untracked", "deleted", or None for modified
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

    #[cfg(target_os = "windows")]
    {
        use sysinfo::{Pid, System, ProcessRefreshKind, UpdateKind, ProcessesToUpdate};
        let mut system = System::new();
        let refresh = ProcessRefreshKind::nothing().with_cwd(UpdateKind::Always);
        system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[Pid::from_u32(pid)]),
            false,
            refresh,
        );
        if let Some(process) = system.process(Pid::from_u32(pid)) {
            if let Some(cwd) = process.cwd() {
                Ok(cwd.to_string_lossy().to_string())
            } else {
                Err("Could not get process CWD".to_string())
            }
        } else {
            Err(format!("Process {} not found", pid))
        }
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Getting terminal cwd is not supported on this platform".to_string())
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
    // Find the git repository root by looking for .git in parent directories
    let git_root = find_git_root(repo_path);
    if git_root.is_none() {
        return Ok(HashMap::new());
    }
    let git_root = git_root.unwrap();

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

#[derive(Serialize, Default)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub billable_input_tokens: u64,
    pub billable_output_tokens: u64,
    pub session_file: Option<String>,
}

#[derive(Deserialize)]
struct ClaudeMessage {
    message: Option<MessageContent>,
}

#[derive(Deserialize)]
struct MessageContent {
    id: Option<String>,
    usage: Option<UsageData>,
}

#[derive(Deserialize)]
struct UsageData {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
}

#[tauri::command]
pub fn get_session_token_usage(project_path: String) -> Result<TokenUsage, String> {
    // Convert project path to Claude's format: /home/user/projects/foo -> -home-user-projects-foo
    // Claude Code replaces both "/" and "." with "-"
    let claude_path_segment = project_path
        .replace("\\", "-")
        .replace("/", "-")
        .replace(".", "-");

    // Build path to Claude sessions directory
    let home = home_dir().ok_or("Could not get home directory")?;
    let sessions_dir = PathBuf::from(&home)
        .join(".claude")
        .join("projects")
        .join(&claude_path_segment);

    if !sessions_dir.exists() {
        return Ok(TokenUsage::default());
    }

    // Find the most recently modified .jsonl file
    let mut newest_file: Option<(PathBuf, std::time::SystemTime)> = None;

    let entries = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "jsonl") {
            if let Ok(metadata) = path.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if newest_file.as_ref().map_or(true, |(_, t)| modified > *t) {
                        newest_file = Some((path, modified));
                    }
                }
            }
        }
    }

    let session_file = match newest_file {
        Some((path, _)) => path,
        None => return Ok(TokenUsage::default()),
    };

    // Parse the JSONL file and sum up token usage
    let file = fs::File::open(&session_file)
        .map_err(|e| format!("Failed to open session file: {}", e))?;
    let reader = BufReader::new(file);

    // Use HashMap to deduplicate by message ID (streaming sends multiple updates per message)
    let mut usage_by_msg: std::collections::HashMap<String, UsageData> = std::collections::HashMap::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        // Parse each line as JSON
        if let Ok(msg) = serde_json::from_str::<ClaudeMessage>(&line) {
            if let Some(message) = msg.message {
                if let (Some(id), Some(u)) = (message.id, message.usage) {
                    // Always keep the latest usage for each message ID
                    usage_by_msg.insert(id, u);
                }
            }
        }
    }

    // Sum up the final usage from each unique message
    let mut usage = TokenUsage {
        session_file: Some(session_file.to_string_lossy().to_string()),
        ..Default::default()
    };

    for u in usage_by_msg.values() {
        let input = u.input_tokens.unwrap_or(0);
        let output = u.output_tokens.unwrap_or(0);
        let cache_read = u.cache_read_input_tokens.unwrap_or(0);
        let cache_creation = u.cache_creation_input_tokens.unwrap_or(0);

        usage.input_tokens += input;
        usage.output_tokens += output;
        usage.cache_read_input_tokens += cache_read;
        usage.cache_creation_input_tokens += cache_creation;

        // Billable: input + cache_creation (cache reads are discounted)
        usage.billable_input_tokens += input + cache_creation;
        usage.billable_output_tokens += output;
    }

    Ok(usage)
}
