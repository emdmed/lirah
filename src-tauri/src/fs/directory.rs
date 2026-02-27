use crate::state::AppState;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Serialize, Clone, Debug)]
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

#[tauri::command]
pub fn read_directory(
    path: Option<String>,
    state: tauri::State<AppState>,
) -> Result<Vec<DirectoryEntry>, String> {
    let dir_path = if let Some(p) = path {
        PathBuf::from(p)
    } else {
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?
    };

    // Try cache first
    {
        let state_lock = state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?;
        if let Some(cached) = state_lock.directory_cache.get(&dir_path) {
            return Ok((*cached).clone());
        }
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
    result.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    // Store in cache
    {
        let state_lock = state
            .lock()
            .map_err(|e| format!("Failed to lock state: {}", e))?;
        state_lock.directory_cache.set(dir_path, result.clone());
    }

    Ok(result)
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn read_directory_recursive(
    path: Option<String>,
    max_depth: Option<usize>,
    max_files: Option<usize>,
) -> Result<Vec<RecursiveDirectoryEntry>, String> {
    let root_path = if let Some(ref p) = path {
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

    let mut entries: Vec<RecursiveDirectoryEntry> = Vec::new();
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
                    if ignore_dirs.contains(name) {
                        return false;
                    }
                }

                // On Windows, skip directories with hidden/system attributes
                // and skip symlinks/junctions at the filter level to prevent traversal
                #[cfg(target_os = "windows")]
                {
                    if e.path_is_symlink() {
                        return false;
                    }
                    if let Ok(metadata) = std::fs::symlink_metadata(e.path()) {
                        use std::os::windows::fs::MetadataExt;
                        let attrs = metadata.file_attributes();
                        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
                        const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
                        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
                        if attrs
                            & (FILE_ATTRIBUTE_HIDDEN
                                | FILE_ATTRIBUTE_SYSTEM
                                | FILE_ATTRIBUTE_REPARSE_POINT)
                            != 0
                        {
                            return false;
                        }
                    }
                }
            }
            true
        })
    {
        // Check if we've reached the file limit
        if entries.len() >= max_files {
            eprintln!(
                "Warning: Reached max file limit of {}. Last 5 paths:",
                max_files
            );
            for e in entries.iter().rev().take(5) {
                eprintln!("  - {}", e.path);
            }
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
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}
