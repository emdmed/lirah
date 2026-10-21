use crate::state::AppState;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

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
fn find_git_root(start_path: &Path) -> Option<PathBuf> {
    let mut current = start_path.to_path_buf();
    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

/// The git directory of a work tree: `.git` itself, or for a linked worktree or
/// submodule, the directory its `.git` file points at.
pub(crate) fn resolve_git_dir(work_tree: &Path) -> Option<PathBuf> {
    let dot_git = work_tree.join(".git");
    let meta = fs::metadata(&dot_git).ok()?;
    if meta.is_dir() {
        return Some(dot_git);
    }
    let content = fs::read_to_string(&dot_git).ok()?;
    let target = PathBuf::from(content.trim().strip_prefix("gitdir:")?.trim());
    Some(if target.is_absolute() {
        target
    } else {
        work_tree.join(target)
    })
}

/// Branch checked out in `work_tree`, or None when HEAD is detached.
fn branch_from_head(head: &str) -> Option<String> {
    head.trim()
        .strip_prefix("ref: refs/heads/")
        .map(|s| s.to_string())
}

/// Current branch of a work tree; None if it is not a repo or HEAD is detached.
pub(crate) fn read_current_branch(work_tree: &Path) -> Option<String> {
    let head = fs::read_to_string(resolve_git_dir(work_tree)?.join("HEAD")).ok()?;
    branch_from_head(&head)
}

/// Run git in `dir` without taking optional locks: a background status must not
/// rewrite .git/index, or the watcher would see the write and ask for stats again.
fn git_output(dir: &Path, args: &[&str]) -> Result<Option<Vec<u8>>, String> {
    let output = Command::new("git")
        .arg("--no-optional-locks")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("Failed to execute git {}: {}", args.first().unwrap_or(&""), e))?;
    Ok(output.status.success().then_some(output.stdout))
}

/// Untracked files whose lines are actually counted; the rest get a size-based
/// estimate so a huge untracked tree (an unignored build dir) stays cheap.
const MAX_COUNTED_UNTRACKED: usize = 200;
/// Files at least this big are estimated even within the cap.
const MAX_COUNTED_UNTRACKED_BYTES: u64 = 100_000;
/// Average bytes per line used for the estimate.
const BYTES_PER_LINE_ESTIMATE: u64 = 50;

fn untracked_line_count(path: &Path, count_exactly: bool) -> usize {
    let size = match fs::metadata(path) {
        Ok(m) if m.is_file() => m.len(),
        _ => return 0,
    };
    if count_exactly && size < MAX_COUNTED_UNTRACKED_BYTES {
        if let Ok(bytes) = fs::read(path) {
            let newlines = bytes.iter().filter(|&&b| b == b'\n').count();
            // Same as str::lines(): a final line without a newline still counts.
            let unterminated = !bytes.is_empty() && bytes.last() != Some(&b'\n');
            return newlines + usize::from(unterminated);
        }
    }
    (size / BYTES_PER_LINE_ESTIMATE) as usize
}

/// What `git status --porcelain=v2 -z` says about the work tree.
#[derive(Default)]
struct StatusSummary {
    /// Repo-relative paths deleted in the index or the work tree.
    deleted: HashSet<String>,
    /// Repo-relative untracked paths, in git's order.
    untracked: Vec<String>,
}

fn parse_porcelain_v2(raw: &[u8]) -> StatusSummary {
    let text = String::from_utf8_lossy(raw);
    let mut summary = StatusSummary::default();
    let mut records = text.split('\0');
    while let Some(record) = records.next() {
        let mut kind = record.splitn(2, ' ');
        match kind.next() {
            // 1 XY sub mH mI mW hH hI path
            Some("1") => {
                let fields: Vec<&str> = record.splitn(9, ' ').collect();
                if fields.len() == 9 && fields[1].contains('D') {
                    summary.deleted.insert(fields[8].to_string());
                }
            }
            // 2 XY sub mH mI mW hH hI Xscore path, then origPath as its own record
            Some("2") => {
                let fields: Vec<&str> = record.splitn(10, ' ').collect();
                if fields.len() == 10 && fields[1].contains('D') {
                    summary.deleted.insert(fields[9].to_string());
                }
                records.next();
            }
            Some("?") => {
                if let Some(path) = kind.next().filter(|p| !p.is_empty()) {
                    summary.untracked.push(path.to_string());
                }
            }
            // "u" (unmerged), "!" (ignored), "#" (headers), "" (trailing NUL)
            _ => {}
        }
    }
    summary
}

/// Parse `git diff --numstat -z` into (repo-relative path, added, deleted).
/// Binary files report "-" and count as 0; renames carry the old and new path
/// as two extra NUL-terminated records, and the new path is the one kept.
fn parse_numstat_z(raw: &[u8]) -> Vec<(String, usize, usize)> {
    let text = String::from_utf8_lossy(raw);
    let mut out = Vec::new();
    let mut records = text.split('\0');
    while let Some(record) = records.next() {
        let mut fields = record.splitn(3, '\t');
        let (Some(added), Some(deleted), Some(path)) = (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        let path = if path.is_empty() {
            records.next();
            match records.next() {
                Some(new_path) => new_path,
                None => break,
            }
        } else {
            path
        };
        out.push((
            path.to_string(),
            added.parse().unwrap_or(0),
            deleted.parse().unwrap_or(0),
        ));
    }
    out
}

fn get_git_diff_stats(repo_path: &Path) -> Result<HashMap<String, GitStats>, String> {
    let git_root = match find_git_root(repo_path) {
        Some(root) => root,
        None => return Ok(HashMap::new()),
    };

    // One status for deletions + untracked files, one numstat for line counts.
    let status = git_output(
        &git_root,
        &["status", "--porcelain=v2", "-z", "--untracked-files=all"],
    )?
    .map(|raw| parse_porcelain_v2(&raw))
    .unwrap_or_default();
    // Fails on a repo with no commits yet (no HEAD); status still covers it.
    let numstat = git_output(&git_root, &["diff", "HEAD", "--numstat", "-z"])?
        .map(|raw| parse_numstat_z(&raw))
        .unwrap_or_default();

    let mut stats_map = HashMap::with_capacity(numstat.len() + status.untracked.len());

    for (relative_path, added, deleted) in numstat {
        let status_label = status
            .deleted
            .contains(&relative_path)
            .then(|| "deleted".to_string());
        stats_map.insert(
            git_root.join(&relative_path).to_string_lossy().to_string(),
            GitStats {
                added,
                deleted,
                status: status_label,
            },
        );
    }

    for (i, relative_path) in status.untracked.iter().enumerate() {
        let absolute_path = git_root.join(relative_path);
        let key = absolute_path.to_string_lossy().to_string();
        if stats_map.contains_key(&key) {
            continue;
        }
        let line_count = untracked_line_count(&absolute_path, i < MAX_COUNTED_UNTRACKED);
        stats_map.insert(
            key,
            GitStats {
                added: line_count,
                deleted: 0,
                status: Some("untracked".to_string()),
            },
        );
    }

    Ok(stats_map)
}

#[tauri::command]
pub async fn get_git_stats(
    path: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Arc<HashMap<String, GitStats>>, String> {
    let state = state.inner().clone();
    crate::ipc::blocking("get_git_stats", move || {
        let repo_path = match path {
            Some(p) => PathBuf::from(p),
            None => std::env::current_dir()
                .map_err(|e| format!("Failed to get current directory: {}", e))?,
        };

        // Canonical cache key; the fs watcher invalidates with the same key.
        let canonical_path = repo_path
            .canonicalize()
            .unwrap_or_else(|_| repo_path.clone());

        // The state lock is only held for the cache lookups, never across git.
        let cached = state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?
            .git_cache
            .get(&canonical_path);
        if let Some(stats) = cached {
            return Ok(stats);
        }

        let stats = Arc::new(get_git_diff_stats(&repo_path)?);

        state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?
            .git_cache
            .set(canonical_path, stats.clone());

        Ok(stats)
    })
    .await
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
pub async fn get_current_branch(repo_path: String) -> Result<Option<String>, String> {
    crate::ipc::blocking("get_current_branch", move || {
        let Some(git_dir) = resolve_git_dir(Path::new(&repo_path)) else {
            return Ok(None);
        };
        let head = fs::read_to_string(git_dir.join("HEAD"))
            .map_err(|e| format!("Failed to read HEAD: {}", e))?;
        Ok(branch_from_head(&head))
    })
    .await
}

#[tauri::command]
pub async fn get_git_diff(
    file_path: String,
    repo_path: String,
    base_ref: Option<String>,
    head_ref: Option<String>,
) -> Result<GitDiffResult, String> {
    crate::ipc::blocking("get_git_diff", move || {
        git_diff_blocking(file_path, repo_path, base_ref, head_ref)
    })
    .await
}

/// Diff of one file between `base_ref` (default HEAD) and `head_ref`, or the
/// working tree when there is no `head_ref`.
fn git_diff_blocking(
    file_path: String,
    repo_path: String,
    base_ref: Option<String>,
    head_ref: Option<String>,
) -> Result<GitDiffResult, String> {
    let base = base_ref.unwrap_or_else(|| "HEAD".to_string());
    let repo = PathBuf::from(&repo_path);
    let file = PathBuf::from(&file_path);

    // Check if .git exists (a directory, or a file for linked worktrees)
    if !repo.join(".git").exists() {
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

    // Get old content from git (the base version)
    let old_output = Command::new("git")
        .arg("show")
        .arg(format!("{}:{}", base, relative_path))
        .current_dir(&repo)
        .output()
        .map_err(|e| format!("Failed to execute git show: {}", e))?;

    let is_new_file = !old_output.status.success();
    let old_content = if is_new_file {
        String::new()
    } else {
        String::from_utf8_lossy(&old_output.stdout).to_string()
    };

    // New content: that commit's version, or the file on disk
    let (new_content, new_exists) = match &head_ref {
        Some(head) => {
            let out = Command::new("git")
                .arg("show")
                .arg(format!("{}:{}", head, relative_path))
                .current_dir(&repo)
                .output()
                .map_err(|e| format!("Failed to execute git show: {}", e))?;
            if out.status.success() {
                (String::from_utf8_lossy(&out.stdout).to_string(), true)
            } else {
                (String::new(), false)
            }
        }
        None if file.exists() => (
            fs::read_to_string(&file).map_err(|e| format!("Failed to read file: {}", e))?,
            true,
        ),
        None => (String::new(), false),
    };

    let is_deleted_file = !new_exists && !is_new_file;

    // Count changes using git diff --numstat
    let mut numstat_cmd = Command::new("git");
    numstat_cmd.arg("diff").arg(&base);
    if let Some(head) = &head_ref {
        numstat_cmd.arg(head);
    }
    let numstat_output = numstat_cmd
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn porcelain_v2_collects_deleted_and_untracked() {
        let raw = b"1 .D N... 100644 100644 000000 abc abc gone.txt\x00\
1 M. N... 100644 100644 100644 abc def dir/with space.rs\x00\
2 R. N... 100644 100644 100644 abc abc R100 new name.rs\x00old name.rs\x00\
? notes/todo.md\x00? b.txt\x00";
        let s = parse_porcelain_v2(raw);
        assert!(s.deleted.contains("gone.txt"));
        assert_eq!(s.deleted.len(), 1);
        assert_eq!(s.untracked, vec!["notes/todo.md", "b.txt"]);
    }

    #[test]
    fn numstat_z_handles_renames_and_binary() {
        let raw = b"3\t1\tsrc/a.rs\x00-\t-\timg.png\x002\t0\t\x00old.rs\x00new.rs\x00";
        let rows = parse_numstat_z(raw);
        assert_eq!(
            rows,
            vec![
                ("src/a.rs".to_string(), 3, 1),
                ("img.png".to_string(), 0, 0),
                ("new.rs".to_string(), 2, 0),
            ]
        );
    }

    #[test]
    fn branch_from_head_detached_is_none() {
        assert_eq!(branch_from_head("ref: refs/heads/main\n").as_deref(), Some("main"));
        assert_eq!(branch_from_head("0123456789abcdef\n"), None);
    }
}
