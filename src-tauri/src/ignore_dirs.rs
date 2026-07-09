/// Shared list of directories to ignore when walking or watching the filesystem.
/// Used by both `fs_watcher` and `fs::directory` to keep ignore rules in sync.
pub const IGNORE_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".cache",
    ".next",
    ".nuxt",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
    ".tox",
    ".mypy_cache",
    ".orchestration",
];

/// File extensions/patterns to ignore (editor temp files, OS files).
const IGNORE_EXTENSIONS: &[&str] = &[
    ".swp", ".swo", ".swn", ".swx", // vim/nvim swap files
    ".tmp", ".bak", ".orig",
    "~", // editor backup files
];

/// File prefixes to ignore.
const IGNORE_PREFIXES: &[&str] = &[
    ".#", // emacs lock files
    "#",  // emacs auto-save
];

/// Returns true if a file (by name/path) should be hidden from the tree and
/// filesystem watchers — editor swap/backup files, OS junk, and atomic-write
/// temp files. Shared by `fs_watcher` and `fs::directory` to stay in sync.
pub fn should_ignore_file(path: &std::path::Path) -> bool {
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        for ext in IGNORE_EXTENSIONS {
            if name.ends_with(ext) {
                return true;
            }
        }
        for prefix in IGNORE_PREFIXES {
            if name.starts_with(prefix) {
                return true;
            }
        }
        // Atomic-write temp files, e.g. "foo.md.tmp.2380.c0290a28b7c6".
        if name.contains(".tmp.") {
            return true;
        }
        // 4913 is nvim's writability test file.
        if name == "4913" {
            return true;
        }
    }
    false
}
