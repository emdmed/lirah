use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::ignore_dirs::IGNORE_DIRS;
use crate::state::AppState;

/// Payload emitted with "fs-changes" events so the frontend can do incremental updates.
#[derive(Serialize, Clone, Debug, Default)]
pub struct FsChangesPayload {
    pub created: Vec<String>,
    pub deleted: Vec<String>,
    pub root_path: String,
}

/// File extensions/patterns to ignore (editor temp files, OS files)
const IGNORE_EXTENSIONS: &[&str] = &[
    ".swp", ".swo", ".swn", ".swx",  // vim/nvim swap files
    ".tmp", ".bak", ".orig",
    "~",                               // editor backup files
];

/// File prefixes to ignore
const IGNORE_PREFIXES: &[&str] = &[
    ".#",   // emacs lock files
    "#",    // emacs auto-save
];

fn should_ignore_file(path: &Path) -> bool {
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        // Check extensions
        for ext in IGNORE_EXTENSIONS {
            if name.ends_with(ext) {
                return true;
            }
        }
        // Check prefixes
        for prefix in IGNORE_PREFIXES {
            if name.starts_with(prefix) {
                return true;
            }
        }
        // 4913 is nvim's writability test file
        if name == "4913" {
            return true;
        }
    }
    false
}

struct WatcherHandle {
    // Kept alive — dropping signals the watcher thread to stop
    _stop_tx: mpsc::Sender<()>,
}

/// Global store for active filesystem watchers (multiple per project path)
pub struct FsWatcherStore {
    active: Arc<Mutex<HashMap<PathBuf, WatcherHandle>>>,
}

impl FsWatcherStore {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Walk a directory tree and watch each non-ignored directory individually.
/// This avoids setting up inotify watches on .git, node_modules, target, etc.
fn watch_directory_selective(
    watcher: &mut RecommendedWatcher,
    root: &Path,
    ignore_set: &HashSet<&str>,
) -> Result<(), String> {
    // Watch the root itself
    watcher
        .watch(root, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch {}: {}", root.display(), e))?;

    let mut stack = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if ignore_set.contains(name) || name.starts_with('.') && ignore_set.contains(name) {
                    continue;
                }
            }

            if watcher.watch(&path, RecursiveMode::NonRecursive).is_ok() {
                stack.push(path);
            }
        }
    }

    Ok(())
}

/// Start watching a directory for file create/delete events.
/// Emits "fs-changes" Tauri event with debouncing.
#[tauri::command]
pub fn start_fs_watcher(
    path: String,
    app_handle: AppHandle,
    store: tauri::State<Arc<FsWatcherStore>>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let watch_path = PathBuf::from(&path);
    if !watch_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let mut active = store.active.lock().map_err(|e| format!("Lock error: {}", e))?;

    // If already watching this path, no-op
    if active.contains_key(&watch_path) {
        return Ok(());
    }

    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    /// Per-event info sent from the notify callback to the debounce thread.
    #[derive(Debug)]
    enum FsEvent {
        Created(String),
        Deleted(String),
        GitChanged,
    }

    let (event_tx, event_rx) = mpsc::channel::<FsEvent>();

    let ignore_set: HashSet<&'static str> = IGNORE_DIRS.iter().copied().collect();
    let ignore_set_for_callback = ignore_set.clone();
    let watch_path_clone = watch_path.clone();
    let app_state = state.inner().clone();

    /// Git state files that indicate index/HEAD changes worth notifying about.
    const GIT_STATE_FILES: &[&str] = &[
        "index", "HEAD", "ORIG_HEAD", "MERGE_HEAD",
        "CHERRY_PICK_HEAD", "REBASE_HEAD", "COMMIT_EDITMSG",
    ];

    let git_dir = watch_path.join(".git");
    let has_git = git_dir.is_dir();

    // Create the notify watcher — filter events in the callback and tag them
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            // Check if this is a .git state file change
            let is_git_event = event.paths.iter().any(|p| {
                p.components().any(|c| {
                    matches!(c, std::path::Component::Normal(n) if n == ".git")
                }) && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|name| GIT_STATE_FILES.contains(&name))
                    .unwrap_or(false)
            });

            if is_git_event {
                let _ = event_tx.send(FsEvent::GitChanged);
                return;
            }

            let is_create = matches!(event.kind, EventKind::Create(_));
            let is_remove = matches!(event.kind, EventKind::Remove(_));

            if !is_create && !is_remove {
                return;
            }

            for p in &event.paths {
                // Filter out temp/editor files and ignored directories
                if should_ignore_file(p) {
                    continue;
                }
                let dominated_by_ignore = p.components().any(|c| {
                    if let std::path::Component::Normal(name) = c {
                        if let Some(s) = name.to_str() {
                            return ignore_set_for_callback.contains(s);
                        }
                    }
                    false
                });
                if dominated_by_ignore {
                    continue;
                }

                let path_str = p.to_string_lossy().to_string();
                if is_create {
                    let _ = event_tx.send(FsEvent::Created(path_str));
                } else {
                    let _ = event_tx.send(FsEvent::Deleted(path_str));
                }
            }
        }
    }).map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Watch directories selectively — skip ignored dirs at inotify level
    watch_directory_selective(&mut watcher, &watch_path, &ignore_set)?;

    // Also watch .git directory for index/HEAD changes (unified watcher)
    if has_git {
        let _ = watcher.watch(&git_dir, RecursiveMode::NonRecursive);
    }

    // Debounce thread: collect events, aggregate paths, emit after quiet period
    thread::spawn(move || {
        // Keep watcher alive in this thread
        let _watcher = watcher;
        let debounce = Duration::from_millis(1000);

        loop {
            // Wait for either a stop signal or a FS event
            match stop_rx.try_recv() {
                Ok(()) | Err(mpsc::TryRecvError::Disconnected) => break,
                Err(mpsc::TryRecvError::Empty) => {}
            }

            match event_rx.recv_timeout(Duration::from_millis(200)) {
                Ok(first_event) => {
                    // Start collecting — seed with the first event
                    let mut payload = FsChangesPayload::default();
                    let mut git_changed = false;
                    match first_event {
                        FsEvent::Created(p) => payload.created.push(p),
                        FsEvent::Deleted(p) => payload.deleted.push(p),
                        FsEvent::GitChanged => git_changed = true,
                    }

                    // Drain further events within debounce window
                    while let Ok(ev) = event_rx.recv_timeout(debounce) {
                        match ev {
                            FsEvent::Created(p) => payload.created.push(p),
                            FsEvent::Deleted(p) => payload.deleted.push(p),
                            FsEvent::GitChanged => git_changed = true,
                        }
                    }

                    // Deduplicate
                    payload.created.sort();
                    payload.created.dedup();
                    payload.deleted.sort();
                    payload.deleted.dedup();

                    let has_fs_changes = !payload.created.is_empty() || !payload.deleted.is_empty();

                    // Invalidate directory cache and emit fs-changes if there were file changes
                    if has_fs_changes {
                        if let Ok(state_lock) = app_state.lock() {
                            state_lock.directory_cache.invalidate(&watch_path_clone);
                        }
                        payload.root_path = watch_path_clone.to_string_lossy().to_string();
                        let _ = app_handle.emit("fs-changes", &payload);
                    }

                    // Invalidate git cache and emit git-stats-changed if .git changed
                    if git_changed {
                        if let Ok(state_lock) = app_state.lock() {
                            state_lock.git_cache.invalidate(&watch_path_clone);
                        }
                        let _ = app_handle.emit("git-stats-changed", watch_path_clone.to_string_lossy().to_string());
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    active.insert(watch_path, WatcherHandle {
        _stop_tx: stop_tx,
    });

    Ok(())
}

/// Stop the filesystem watcher for a specific path.
/// If no path is given, stops all watchers (backwards compat).
#[tauri::command]
pub fn stop_fs_watcher(
    path: Option<String>,
    store: tauri::State<Arc<FsWatcherStore>>,
) -> Result<(), String> {
    let mut active = store.active.lock().map_err(|e| format!("Lock error: {}", e))?;
    match path {
        Some(p) => {
            let key = PathBuf::from(p);
            active.remove(&key); // Dropping the sender signals the thread to stop
        }
        None => {
            active.clear(); // Stop all watchers
        }
    }
    Ok(())
}
