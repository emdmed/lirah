use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::state::AppState;

/// Directories to ignore when watching for filesystem changes
const IGNORE_DIRS: &[&str] = &[
    ".git", "node_modules", "target", "dist", "build",
    ".next", ".nuxt", "__pycache__", ".pytest_cache",
    ".venv", "venv", ".tox", ".mypy_cache",
    ".orchestration",
];

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
    path: PathBuf,
}

/// Global store for active filesystem watchers (one per project path)
pub struct FsWatcherStore {
    active: Arc<Mutex<Option<WatcherHandle>>>,
}

impl FsWatcherStore {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(None)),
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
    if let Some(handle) = active.as_ref() {
        if handle.path == watch_path {
            return Ok(());
        }
        // Stop previous watcher (drop sender signals thread to stop)
        active.take();
    }

    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (event_tx, event_rx) = mpsc::channel::<()>();

    let ignore_set: HashSet<&'static str> = IGNORE_DIRS.iter().copied().collect();
    let ignore_set_for_callback = ignore_set.clone();
    let watch_path_clone = watch_path.clone();
    let app_state = state.inner().clone();

    // Create the notify watcher — filter events in the callback
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            match event.kind {
                EventKind::Create(_) | EventKind::Remove(_) => {
                    // Filter out events for temp/editor files
                    let dominated_by_ignore = event.paths.iter().all(|p| {
                        should_ignore_file(p) || p.components().any(|c| {
                            if let std::path::Component::Normal(name) = c {
                                if let Some(s) = name.to_str() {
                                    return ignore_set_for_callback.contains(s);
                                }
                            }
                            false
                        })
                    });
                    if !dominated_by_ignore {
                        let _ = event_tx.send(());
                    }
                }
                _ => {}
            }
        }
    }).map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Watch directories selectively — skip ignored dirs at inotify level
    watch_directory_selective(&mut watcher, &watch_path, &ignore_set)?;

    // Debounce thread: collect events, emit after quiet period
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
                Ok(()) => {
                    // Got an event — drain further events within debounce window
                    while event_rx.recv_timeout(debounce).is_ok() {}
                    // Invalidate directory cache so next read_directory_recursive is fresh
                    if let Ok(state_lock) = app_state.lock() {
                        state_lock.directory_cache.invalidate(&watch_path_clone);
                    }
                    let _ = app_handle.emit("fs-changes", &watch_path_clone.to_string_lossy().to_string());
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    *active = Some(WatcherHandle {
        _stop_tx: stop_tx,
        path: watch_path,
    });

    Ok(())
}

/// Stop the active filesystem watcher
#[tauri::command]
pub fn stop_fs_watcher(
    store: tauri::State<Arc<FsWatcherStore>>,
) -> Result<(), String> {
    let mut active = store.active.lock().map_err(|e| format!("Lock error: {}", e))?;
    active.take(); // Dropping the sender signals the thread to stop
    Ok(())
}
