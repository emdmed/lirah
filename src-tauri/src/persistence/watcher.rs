//! Tells the UI when a file under `~/.lirah/` is changed by someone else.

use super::store;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

const EVENT: &str = "lirah-file-changed";
const BACKUPS_DIR: &str = "backups";

/// Keeps the watcher alive for the whole run; `Some` once started.
static WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

#[derive(Serialize, Clone)]
struct FileChanged {
    path: String,
    revision: u64,
}

pub fn start(app: AppHandle) -> Result<(), String> {
    let mut watcher = WATCHER.lock().unwrap_or_else(|e| e.into_inner());
    if watcher.is_some() {
        return Ok(());
    }
    let dir = crate::util::lirah_dir().ok_or("No home directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;

    let mut new_watcher = notify::recommended_watcher(move |event: notify::Result<Event>| {
        if let Ok(event) = event {
            report_changes(&app, &event);
        }
    })
    .map_err(|e| format!("Failed to watch {}: {}", dir.display(), e))?;
    new_watcher
        .watch(&dir, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {}", dir.display(), e))?;

    *watcher = Some(new_watcher);
    Ok(())
}

fn report_changes(app: &AppHandle, event: &Event) {
    if matches!(event.kind, EventKind::Access(_) | EventKind::Remove(_)) {
        return;
    }
    for path in event.paths.iter().filter(|path| is_persisted_file(path)) {
        // Gone or half-written: the next event reports the finished file.
        let Ok(Some(file)) = store::read(path) else { continue };
        if store::note_revision(path, file.revision) {
            let change = FileChanged { path: path.to_string_lossy().into_owned(), revision: file.revision };
            let _ = app.emit(EVENT, change);
        }
    }
}

/// A `.json` file outside any `backups` folder (this skips the `.tmp` files of
/// atomic writes too).
fn is_persisted_file(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext == "json")
        && !path.components().any(|part| part.as_os_str() == BACKUPS_DIR)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_json_files_outside_backups_are_persisted_files() {
        assert!(is_persisted_file(Path::new("/home/u/.lirah/tasks.json")));
        assert!(is_persisted_file(Path::new("/home/u/.lirah/sub/plans.json")));
        assert!(!is_persisted_file(Path::new("/home/u/.lirah/tasks.json.tmp")));
        assert!(!is_persisted_file(Path::new("/home/u/.lirah/backups/tasks.v1.100.json")));
        assert!(!is_persisted_file(Path::new("/home/u/.lirah/notes.txt")));
    }
}
