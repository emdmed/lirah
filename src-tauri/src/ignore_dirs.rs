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
