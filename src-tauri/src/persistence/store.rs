use super::envelope::Persisted;
use std::fs;
use std::io::ErrorKind;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Makes "check the revision, then write" one step across commands.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// Last revision of each file this process wrote or reported, so the watcher
/// stays quiet about our own writes and about repeated events for one change.
static KNOWN_REVISIONS: Mutex<Option<HashMap<PathBuf, u64>>> = Mutex::new(None);

/// Record `revision` as the latest of `path`. True when it was not already
/// known, i.e. the change came from someone else and is worth reporting.
pub fn note_revision(path: &Path, revision: u64) -> bool {
    let mut known = KNOWN_REVISIONS.lock().unwrap_or_else(|e| e.into_inner());
    known.get_or_insert_with(HashMap::new).insert(path.to_path_buf(), revision) != Some(revision)
}

pub fn read(path: &Path) -> Result<Option<Persisted>, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Failed to read {}: {}", path.display(), e)),
    };
    Persisted::from_json(&text)
        .map(Some)
        .map_err(|e| format!("Corrupt file {}: {}", path.display(), e))
}

pub fn write(
    path: &Path,
    version: u32,
    data: serde_json::Value,
    expected_revision: u64,
) -> Result<Persisted, String> {
    let _lock = WRITE_LOCK.lock().map_err(|_| "Write lock poisoned".to_string())?;

    let current = read(path)?.map_or(0, |file| file.revision);
    if current != expected_revision {
        return Err(format!(
            "conflict: {} is at revision {}, expected {}",
            path.display(),
            current,
            expected_revision
        ));
    }

    let saved = Persisted { version, revision: current + 1, data };
    write_atomically(path, &saved)?;
    note_revision(path, saved.revision);
    Ok(saved)
}

/// Write to a temp file next to `path`, then rename over it: a crash leaves
/// either the old file or the new one, never half of it.
fn write_atomically(path: &Path, file: &Persisted) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories: {}", e))?;
    }
    let text = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    let mut temp = path.as_os_str().to_owned();
    temp.push(".tmp");
    fs::write(&temp, text).map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    fs::rename(&temp, path).map_err(|e| format!("Failed to replace {}: {}", path.display(), e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;

    /// A fresh, empty folder per test (tests run in parallel).
    fn test_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lirah-persistence-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn own_write_is_not_reported_as_a_change() {
        let path = test_dir("own-write").join("a.json");
        let saved = write(&path, 1, json!(1), 0).unwrap();
        assert!(!note_revision(&path, saved.revision));
    }

    #[test]
    fn external_revision_is_reported_once() {
        let path = test_dir("external").join("a.json");
        let saved = write(&path, 1, json!(1), 0).unwrap();

        assert!(note_revision(&path, saved.revision + 1));
        assert!(!note_revision(&path, saved.revision + 1), "repeated event for the same change");
    }

    #[test]
    fn missing_file_reads_as_none() {
        let path = test_dir("missing").join("a.json");
        assert_eq!(read(&path).unwrap(), None);
    }

    #[test]
    fn write_creates_parents_and_leaves_no_temp_file() {
        let dir = test_dir("write");
        let path = dir.join("deep").join("a.json");

        let saved = write(&path, 2, json!({"x": 1}), 0).unwrap();

        assert_eq!(saved.revision, 1);
        assert_eq!(read(&path).unwrap(), Some(saved));
        assert!(!dir.join("deep").join("a.json.tmp").exists());
    }

    #[test]
    fn write_bumps_revision_each_time() {
        let path = test_dir("bump").join("a.json");
        write(&path, 1, json!(1), 0).unwrap();
        let second = write(&path, 1, json!(2), 1).unwrap();
        assert_eq!(second.revision, 2);
        assert_eq!(second.data, json!(2));
    }

    #[test]
    fn stale_revision_is_a_conflict_and_keeps_the_file() {
        let path = test_dir("conflict").join("a.json");
        write(&path, 1, json!("first"), 0).unwrap();

        let err = write(&path, 1, json!("second"), 0).unwrap_err();

        assert!(err.starts_with("conflict:"), "{err}");
        assert_eq!(read(&path).unwrap().unwrap().data, json!("first"));
    }

    #[test]
    fn old_file_without_revision_reads_as_revision_zero() {
        let dir = test_dir("old");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("tasks.json");
        fs::write(&path, r#"{"version": 1, "tasks": [1, 2]}"#).unwrap();

        let old = read(&path).unwrap().unwrap();
        assert_eq!((old.version, old.revision), (1, 0));
        assert_eq!(old.data, json!({"tasks": [1, 2]}));

        assert_eq!(write(&path, 1, json!({}), 0).unwrap().revision, 1);
    }

    #[test]
    fn corrupt_file_is_an_error_and_is_not_overwritten() {
        let dir = test_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.json");
        fs::write(&path, "{ not json").unwrap();

        assert!(read(&path).unwrap_err().starts_with("Corrupt file"));
        assert!(write(&path, 1, json!(1), 0).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "{ not json");
    }
}
