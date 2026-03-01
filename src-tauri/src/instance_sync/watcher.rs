use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Start watching the instances directory for changes and emit Tauri events
pub fn start_instance_watcher(app_handle: AppHandle) {
    let instances_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".lirah")
        .join("instances");

    // Ensure directory exists
    let _ = std::fs::create_dir_all(&instances_dir);

    thread::spawn(move || {
        let (tx, rx) = mpsc::channel();

        let mut watcher: RecommendedWatcher = match notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                        let _ = tx.send(());
                    }
                    _ => {}
                }
            }
        }) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[InstanceWatcher] Failed to create watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(&instances_dir, RecursiveMode::NonRecursive) {
            eprintln!("[InstanceWatcher] Failed to watch directory: {}", e);
            return;
        }

        // Debounce: wait for events to settle before emitting
        loop {
            match rx.recv() {
                Ok(()) => {
                    // Drain any queued events within 500ms
                    while rx.recv_timeout(Duration::from_millis(500)).is_ok() {}
                    let _ = app_handle.emit("instance-sync-changed", ());
                }
                Err(_) => break,
            }
        }
    });
}
