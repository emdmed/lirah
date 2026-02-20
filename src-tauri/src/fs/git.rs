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
pub fn get_current_branch(repo_path: String) -> Result<Option<String>, String> {
    let repo = PathBuf::from(&repo_path);
    let git_dir = repo.join(".git");
    if !git_dir.exists() {
        return Ok(None);
    }

    let head_path = git_dir.join("HEAD");
    let head_content = std::fs::read_to_string(&head_path)
        .map_err(|e| format!("Failed to read HEAD: {}", e))?;
    let trimmed = head_content.trim();

    let branch = trimmed
        .strip_prefix("ref: refs/heads/")
        .map(|s| s.to_string());

    Ok(branch)
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

#[derive(Serialize, Clone, Debug)]
pub struct CompletedTask {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub files: Vec<String>,
    pub file_count: usize,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Serialize)]
pub struct BranchCompletedTasksResult {
    pub base_branch: String,
    pub current_branch: String,
    pub tasks: Vec<CompletedTask>,
}

/// Detect the base branch (main or master) for the repository
fn detect_base_branch(repo_path: &PathBuf) -> Option<String> {
    for branch in &["main", "master"] {
        let output = Command::new("git")
            .args(["rev-parse", "--verify", branch])
            .current_dir(repo_path)
            .output();
        
        if let Ok(out) = output {
            if out.status.success() {
                return Some(branch.to_string());
            }
        }
    }
    None
}

/// Get the merge base between current branch and base branch
fn get_merge_base(repo_path: &PathBuf, base_branch: &str) -> Result<Option<String>, String> {
    let output = Command::new("git")
        .args(["merge-base", base_branch, "HEAD"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to get merge base: {}", e))?;
    
    if output.status.success() {
        let base = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !base.is_empty() {
            return Ok(Some(base));
        }
    }
    Ok(None)
}

/// Analyze file changes to determine the type of task
fn analyze_file_patterns(files: &[String]) -> (String, Option<String>) {
    use std::collections::HashSet;
    
    let mut patterns = HashSet::new();
    let mut components = Vec::new();
    let mut has_tests = false;
    let mut has_docs = false;
    let mut has_config = false;
    
    for file in files {
        let lower = file.to_lowercase();
        
        // Check for test files
        if lower.contains("test") || lower.contains("spec") || lower.contains("__tests__") {
            has_tests = true;
        }
        
        // Check for documentation
        if lower.ends_with(".md") || lower.ends_with(".mdx") || lower.contains("readme") || lower.contains("changelog") {
            has_docs = true;
        }
        
        // Check for config files
        if lower.starts_with(".") || lower.contains("config") || lower.contains("rc") || lower.ends_with(".toml") || lower.ends_with(".yaml") || lower.ends_with(".yml") || lower.ends_with(".json") {
            has_config = true;
        }
        
        // Extract component/feature names from paths
        let parts: Vec<&str> = file.split('/').collect();
        if parts.len() >= 2 {
            // Get the directory name (potential feature/component)
            if let Some(dir) = parts.get(parts.len() - 2) {
                if !dir.starts_with('.') && dir.len() > 1 && !matches!(dir.as_ref(), "src" | "lib" | "app" | "components" | "pages" | "hooks" | "utils") {
                    components.push(dir.to_string());
                }
            }
        }
        
        // Detect patterns from file extensions and paths
        if lower.contains("api") || lower.contains("endpoint") || lower.contains("route") {
            patterns.insert("API");
        }
        if lower.contains("component") || lower.contains("jsx") || lower.contains("tsx") || lower.contains("vue") {
            patterns.insert("UI");
        }
        if lower.contains("hook") || lower.contains("context") || lower.contains("provider") {
            patterns.insert("Logic");
        }
        if lower.contains("style") || lower.contains("css") || lower.contains("scss") || lower.contains("less") {
            patterns.insert("Styling");
        }
        if lower.contains("type") || lower.contains("interface") || lower.contains(".d.ts") {
            patterns.insert("Types");
        }
        if lower.contains("migration") || lower.contains("schema") || lower.contains("model") {
            patterns.insert("Database");
        }
    }
    
    // Generate task title based on patterns
    let title = if patterns.len() == 1 {
        format!("{} implementation", patterns.iter().next().unwrap())
    } else if patterns.len() > 1 {
        let pattern_list: Vec<_> = patterns.iter().cloned().collect();
        format!("{} and {} implementation", pattern_list[..pattern_list.len()-1].join(", "), pattern_list.last().unwrap())
    } else if !components.is_empty() {
        // Use component name if available
        let unique_components: HashSet<_> = components.iter().cloned().collect();
        let comp_list: Vec<_> = unique_components.into_iter().take(2).collect();
        if comp_list.len() == 1 {
            format!("Implement {}", comp_list[0])
        } else {
            format!("Implement {} and related features", comp_list[0])
        }
    } else {
        "Code changes".to_string()
    };
    
    // Generate description
    let mut desc_parts = Vec::new();
    if has_tests {
        desc_parts.push("includes tests");
    }
    if has_docs {
        desc_parts.push("includes documentation");
    }
    if has_config {
        desc_parts.push("configuration updates");
    }
    
    let description = if desc_parts.is_empty() {
        None
    } else {
        Some(format!("Changes {}", desc_parts.join(", ")))
    };
    
    (title, description)
}

/// Group related file changes into logical tasks
fn group_changes_into_tasks(repo_path: &PathBuf, merge_base: &str) -> Result<Vec<CompletedTask>, String> {
    let mut tasks = Vec::new();
    
    // Get all files changed since merge base with stats
    let output = Command::new("git")
        .args([
            "diff",
            "--stat",
            &format!("{}..HEAD", merge_base),
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to get diff stats: {}", e))?;
    
    if !output.status.success() {
        return Ok(tasks);
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut file_changes: Vec<(String, usize, usize)> = Vec::new();
    
    // Parse diff --stat output
    for line in stdout.lines() {
        // Format: " path/to/file | 10 +++++-----"
        if let Some(pipe_pos) = line.find(" | ") {
            let file_path = line[..pipe_pos].trim().to_string();
            let stats_part = &line[pipe_pos + 3..];
            
            // Extract insertions and deletions
            let mut insertions = 0;
            let mut deletions = 0;
            
            if let Some(plus_pos) = stats_part.find('+') {
                let num_str: String = stats_part[..plus_pos].chars().filter(|c| c.is_digit(10)).collect();
                insertions = num_str.parse().unwrap_or(0);
            }
            
            if stats_part.contains('-') {
                let minus_part: String = stats_part.chars().skip_while(|c| *c != '-').collect();
                let num_str: String = minus_part.chars().filter(|c| c.is_digit(10)).collect();
                deletions = num_str.parse().unwrap_or(0);
            }
            
            file_changes.push((file_path, insertions, deletions));
        }
    }
    
    // Group files by directory/feature
    use std::collections::HashMap;
    let mut groups: HashMap<String, Vec<(String, usize, usize)>> = HashMap::new();
    
    for (file, insertions, deletions) in file_changes {
        let group_key = if file.contains('/') {
            let parts: Vec<&str> = file.split('/').collect();
            if parts.len() >= 2 {
                parts[0..parts.len()-1].join("/")
            } else {
                "root".to_string()
            }
        } else {
            "root".to_string()
        };
        
        groups.entry(group_key).or_default().push((file, insertions, deletions));
    }
    
    // Create tasks from groups
    let mut task_id = 0;
    for (group_path, files) in groups {
        task_id += 1;
        
        let file_paths: Vec<String> = files.iter().map(|(f, _, _)| f.clone()).collect();
        let total_additions: usize = files.iter().map(|(_, a, _)| a).sum();
        let total_deletions: usize = files.iter().map(|(_, _, d)| d).sum();
        
        let (title, description) = analyze_file_patterns(&file_paths);
        
        // Refine title based on group path
        let refined_title = if group_path != "root" && !title.starts_with("Implement") {
            if group_path.contains('/') {
                format!("{} in {}", title, group_path.split('/').last().unwrap_or(&group_path))
            } else {
                format!("{} in {}", title, group_path)
            }
        } else {
            title
        };
        
        tasks.push(CompletedTask {
            id: format!("task-{}", task_id),
            title: refined_title,
            description,
            files: file_paths,
            file_count: files.len(),
            additions: total_additions,
            deletions: total_deletions,
        });
    }
    
    // Sort tasks by significance (file count + changes)
    tasks.sort_by(|a, b| {
        let a_score = a.file_count + a.additions + a.deletions;
        let b_score = b.file_count + b.additions + b.deletions;
        b_score.cmp(&a_score)
    });
    
    Ok(tasks)
}

/// Get files changed in a specific commit
fn get_files_for_commit(repo_path: &PathBuf, commit_hash: &str) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .args([
            "diff-tree",
            "--no-commit-id",
            "--name-only",
            "-r",
            commit_hash
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to get files for commit: {}", e))?;
    
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let files: Vec<String> = stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| line.to_string())
            .collect();
        Ok(files)
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn get_branch_completed_tasks(repo_path: String) -> Result<BranchCompletedTasksResult, String> {
    let repo = PathBuf::from(&repo_path);
    let git_dir = repo.join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }
    
    // Detect base branch
    let base_branch = detect_base_branch(&repo)
        .ok_or("Could not detect base branch (main or master)")?;
    
    // Get current branch name
    let current_branch = get_current_branch(repo_path.clone())?
        .unwrap_or_else(|| "HEAD".to_string());
    
    // Get merge base
    let merge_base = get_merge_base(&repo, &base_branch)?
        .ok_or("Could not find merge base with base branch")?;
    
    // Group file changes into logical tasks
    let tasks = group_changes_into_tasks(&repo, &merge_base)?;
    
    Ok(BranchCompletedTasksResult {
        base_branch,
        current_branch,
        tasks,
    })
}
