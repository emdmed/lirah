use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use std::collections::HashSet;
use std::path::PathBuf;
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
    let watch_path_clone = watch_path.clone();
    let app_state = state.inner().clone();

    // Create the notify watcher
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            match event.kind {
                EventKind::Create(_) | EventKind::Remove(_) => {
                    // Filter out events in ignored directories
                    let dominated_by_ignore = event.paths.iter().all(|p| {
                        p.components().any(|c| {
                            if let std::path::Component::Normal(name) = c {
                                if let Some(s) = name.to_str() {
                                    return ignore_set.contains(s);
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

    watcher
        .watch(&watch_path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch path: {}", e))?;

    // Debounce thread: collect events, emit after quiet period
    thread::spawn(move || {
        // Keep watcher alive in this thread
        let _watcher = watcher;
        let debounce = Duration::from_millis(500);

        loop {
            // Wait for either a stop signal or a FS event
            // Use a select-like pattern with timeouts
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
