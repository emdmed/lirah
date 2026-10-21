use crate::ignore_dirs::{should_ignore_file, IGNORE_DIRS};
use crate::state::AppState;
use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Serialize, Clone, Debug)]
pub struct DirectoryEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct RecursiveDirectoryEntry {
    name: String,
    path: String,
    is_dir: bool,
    depth: usize,
    /// Read by the tree builder (src/utils/treeOperations.js).
    parent_path: String,
}

/// Result of `read_directory_recursive`. `truncated` is set when `max_files`
/// cut the walk short; the walk is breadth-first, so what is missing is the
/// deepest part of the tree rather than whole sibling subtrees.
#[derive(Serialize, Debug)]
pub struct RecursiveListing {
    pub entries: Vec<RecursiveDirectoryEntry>,
    pub truncated: bool,
}

/// Identity of a directory that survives symlinks: (device, inode) on unix,
/// the canonical path elsewhere. Used to avoid walking or watching a directory
/// twice, which also breaks symlink loops.
#[cfg(unix)]
pub(crate) type DirKey = (u64, u64);
#[cfg(not(unix))]
pub(crate) type DirKey = PathBuf;

#[cfg(unix)]
pub(crate) fn dir_key(path: &Path) -> Option<DirKey> {
    use std::os::unix::fs::MetadataExt;
    let meta = fs::metadata(path).ok()?;
    Some((meta.dev(), meta.ino()))
}

#[cfg(not(unix))]
pub(crate) fn dir_key(path: &Path) -> Option<DirKey> {
    path.canonicalize().ok()
}

/// On Windows, hidden/system directories and reparse points (symlinks,
/// junctions) are not descended into.
#[cfg(target_os = "windows")]
fn skip_windows_dir(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    fs::symlink_metadata(path)
        .map(|m| {
            m.file_attributes()
                & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM | FILE_ATTRIBUTE_REPARSE_POINT)
                != 0
        })
        .unwrap_or(false)
}

/// Build output and dependency folders that recede in the file panes, like
/// dotfiles. Keep in step with `DIMMED_DIRS` in `file-tree/utils/lsColors.js`.
const DIMMED_DIRS: &[&str] = &[
    "node_modules", "dist", "build", "target", "out", "coverage", ".git", ".next", ".cache", "__pycache__",
];

fn is_dimmed(name: &str) -> bool {
    name.starts_with('.') || DIMMED_DIRS.contains(&name)
}

/// Dimmed entries (dotfiles, build output) last; within each group directories
/// first, then case-insensitive by name. Matches `compareTreeEntries` in the
/// frontend. The key is computed once per entry instead of lowercasing both
/// names on every comparison.
fn sort_entries<T>(entries: &mut [T], is_dir: impl Fn(&T) -> bool, name: impl Fn(&T) -> &str) {
    entries.sort_by_cached_key(|e| (is_dimmed(name(e)), !is_dir(e), name(e).to_lowercase()));
}

fn resolve_dir(path: Option<String>) -> Result<PathBuf, String> {
    match path {
        Some(p) => Ok(PathBuf::from(p)),
        None => std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e)),
    }
}

#[tauri::command]
pub async fn read_directory(
    path: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Arc<Vec<DirectoryEntry>>, String> {
    let state = state.inner().clone();
    crate::ipc::blocking("read_directory", move || {
        let dir_path = resolve_dir(path)?;

        let cached = state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?
            .directory_cache
            .get(&dir_path);
        if let Some(cached) = cached {
            return Ok(cached);
        }

        let entries =
            fs::read_dir(&dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

        let mut result = Vec::new();

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let metadata = entry
                .metadata()
                .map_err(|e| format!("Failed to read metadata: {}", e))?;
            let path = entry.path();

            // Skip editor temp/backup files and atomic-write temp files
            if !metadata.is_dir() && should_ignore_file(&path) {
                continue;
            }

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

        sort_entries(&mut result, |e| e.is_dir, |e| &e.name);

        let result = Arc::new(result);
        state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?
            .directory_cache
            .set(dir_path, result.clone());

        Ok(result)
    })
    .await
}

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    crate::ipc::blocking("read_file_content", move || {
        fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
    })
    .await
}

#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    crate::ipc::blocking("write_file_content", move || {
        if let Some(parent) = Path::new(&path).parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directories: {}", e))?;
        }
        fs::write(&path, &content).map_err(|e| format!("Failed to write file: {}", e))
    })
    .await
}

/// Walk `root` breadth-first, following symlinks (workspaces are made of
/// symlinked projects) but never entering the same directory twice.
fn walk_breadth_first(root: &Path, max_depth: usize, max_files: usize) -> RecursiveListing {
    let ignore_dirs: HashSet<&str> = IGNORE_DIRS.iter().copied().collect();
    let mut entries: Vec<RecursiveDirectoryEntry> = Vec::new();
    let mut truncated = false;

    let mut visited: HashSet<DirKey> = HashSet::new();
    if let Some(key) = dir_key(root) {
        visited.insert(key);
    }

    // (directory, depth of its children); the root's children are depth 1.
    let mut queue: VecDeque<(PathBuf, usize)> = VecDeque::from([(root.to_path_buf(), 1)]);

    'walk: while let Some((dir, depth)) = queue.pop_front() {
        let read = match fs::read_dir(&dir) {
            Ok(read) => read,
            Err(err) => {
                eprintln!("Warning: Failed to read {}: {}", dir.display(), err);
                continue;
            }
        };
        let parent_path = dir.to_string_lossy().to_string();

        for entry in read {
            let entry = match entry {
                Ok(entry) => entry,
                Err(err) => {
                    eprintln!("Warning: Failed to read entry: {}", err);
                    continue;
                }
            };

            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_symlink = entry.file_type().map(|t| t.is_symlink()).unwrap_or(false);
            let is_dir = if is_symlink {
                fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false)
            } else {
                entry.file_type().map(|t| t.is_dir()).unwrap_or(false)
            };

            let mut descend = false;
            if is_dir {
                if ignore_dirs.contains(name.as_str()) {
                    continue;
                }
                #[cfg(target_os = "windows")]
                if is_symlink || skip_windows_dir(&path) {
                    continue;
                }
                // A directory reached again (symlink loop, or two links to
                // one target) is listed but not walked again.
                descend = depth < max_depth && dir_key(&path).is_some_and(|k| visited.insert(k));
            } else if should_ignore_file(&path) {
                // Skip editor temp/backup files and atomic-write temp files
                continue;
            }

            // Checked after filtering, so ignored entries can't trip the limit
            // and flag a tree as truncated when nothing visible was dropped.
            if entries.len() >= max_files {
                truncated = true;
                break 'walk;
            }
            if descend {
                queue.push_back((path.clone(), depth + 1));
            }
            entries.push(RecursiveDirectoryEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                depth,
                parent_path: parent_path.clone(),
            });
        }
    }

    if truncated {
        eprintln!(
            "Warning: Reached max file limit of {} under {}",
            max_files,
            root.display()
        );
    }

    sort_entries(&mut entries, |e| e.is_dir, |e| &e.name);

    RecursiveListing { entries, truncated }
}

#[tauri::command]
pub async fn read_directory_recursive(
    path: Option<String>,
    max_depth: Option<usize>,
    max_files: Option<usize>,
    state: tauri::State<'_, AppState>,
) -> Result<Arc<RecursiveListing>, String> {
    let state = state.inner().clone();
    crate::ipc::blocking("read_directory_recursive", move || {
        let root_path = resolve_dir(path)?;
        let max_depth = max_depth.unwrap_or(10);
        let max_files = max_files.unwrap_or(10000);

        // The global lock is held for the lookup only; the cached listing is
        // shared through an Arc, never copied.
        let cached = state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?
            .directory_cache
            .get_recursive(&root_path, max_depth, max_files);
        if let Some(cached) = cached {
            return Ok(cached);
        }

        let listing = Arc::new(walk_breadth_first(&root_path, max_depth, max_files));

        state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?
            .directory_cache
            .set_recursive(root_path, max_depth, max_files, listing.clone());

        Ok(listing)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sort_puts_dimmed_entries_last() {
        let mut v = vec![
            (".claude", true), ("README.md", false), ("src", true),
            (".gitignore", false), ("node_modules", true), ("apps", true),
        ];
        sort_entries(&mut v, |e| e.1, |e| e.0);
        let names: Vec<_> = v.iter().map(|e| e.0).collect();
        assert_eq!(names, ["apps", "src", "README.md", ".claude", "node_modules", ".gitignore"]);
    }

    #[test]
    fn breadth_first_truncation_keeps_shallow_entries() {
        let root = std::env::temp_dir().join(format!("nevo-dir-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("a/deep/deeper")).unwrap();
        fs::create_dir_all(root.join("b")).unwrap();
        fs::write(root.join("top.txt"), "x").unwrap();
        fs::write(root.join("a/deep/deeper/f.txt"), "x").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&root, root.join("b/loop")).unwrap();

        let full = walk_breadth_first(&root, 10, 1000);
        assert!(!full.truncated);
        assert!(full.entries.iter().any(|e| e.path.ends_with("f.txt")));
        // The loop link is listed once but not walked into.
        assert!(!full.entries.iter().any(|e| e.path.contains("loop/")));

        let cut = walk_breadth_first(&root, 10, 4);
        assert!(cut.truncated);
        assert_eq!(cut.entries.len(), 4);
        assert!(cut.entries.iter().all(|e| e.depth <= 2));
        assert!(cut.entries[0].is_dir);

        let _ = fs::remove_dir_all(&root);
    }
}
