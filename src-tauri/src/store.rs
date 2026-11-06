//! JSON files under ~/.lirah with a schema `version` and a write `revision`.
//!
//! Each file is a JSON object; the store owns its top-level `version` and
//! `revision` keys. Writes go to a temp file in the same folder and are renamed
//! over the target, so readers never see half a file. A write that names an
//! `expected_revision` fails with a conflict carrying the current content if
//! the file moved on since the caller read it.

use serde::Serialize;
use serde_json::{Map, Value};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

/// Schema version written to every file.
const CURRENT_VERSION: u64 = 1;

/// `(from, migrate)`: upgrades a file at version `from` to `from + 1`. Gets the
/// relative path so a migration can apply to one kind of file only.
type Migration = fn(&str, &mut Map<String, Value>);
const MIGRATIONS: &[(u64, Migration)] = &[];

/// Serializes read-compare-write inside the app.
/// shortcut: no cross-process lock, so a CLI write racing the app can slip past the revision check; add a lock file if that shows up.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum StoreError {
    /// The file's revision is not the one the caller expected.
    Conflict { current: Option<Value> },
    Io { message: String },
}

fn io(message: impl ToString) -> StoreError {
    StoreError::Io { message: message.to_string() }
}

/// Resolve `rel` under `base`, rejecting empty, absolute and `..` paths.
fn resolve(base: &Path, rel: &str) -> Result<PathBuf, StoreError> {
    let path = Path::new(rel);
    let ok = !rel.is_empty() && path.components().all(|c| matches!(c, Component::Normal(_)));
    if !ok {
        return Err(io(format!("invalid store path: {rel:?}")));
    }
    Ok(base.join(path))
}

fn revision_of(doc: &Option<Value>) -> u64 {
    doc.as_ref().and_then(|d| d.get("revision")).and_then(Value::as_u64).unwrap_or(0)
}

/// Read and migrate a file. `None` if it does not exist.
pub fn read_at(base: &Path, rel: &str) -> Result<Option<Value>, StoreError> {
    let path = resolve(base, rel)?;
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(io(format!("{}: {e}", path.display()))),
    };
    let mut doc = match serde_json::from_str::<Value>(&text) {
        Ok(Value::Object(m)) => m,
        Ok(_) => return Err(io(format!("{}: not a JSON object", path.display()))),
        Err(e) => return Err(io(format!("{}: {e}", path.display()))),
    };
    // A file without a version (hand-written) is taken as current.
    let mut version = doc.get("version").and_then(Value::as_u64).unwrap_or(CURRENT_VERSION);
    for (from, migrate) in MIGRATIONS {
        if *from == version {
            migrate(rel, &mut doc);
            version = from + 1;
        }
    }
    doc.insert("version".into(), version.into());
    Ok(Some(Value::Object(doc)))
}

/// Write `data` atomically and return what was written (with the new revision).
pub fn write_at(base: &Path, rel: &str, data: Value, expected_revision: Option<u64>) -> Result<Value, StoreError> {
    let path = resolve(base, rel)?;
    let Value::Object(mut doc) = data else {
        return Err(io("store data must be a JSON object"));
    };
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let current = read_at(base, rel)?;
    let revision = revision_of(&current);
    if expected_revision.is_some_and(|r| r != revision) {
        return Err(StoreError::Conflict { current });
    }
    doc.insert("version".into(), CURRENT_VERSION.into());
    doc.insert("revision".into(), (revision + 1).into());
    let doc = Value::Object(doc);

    let dir = path.parent().ok_or_else(|| io("store path has no parent"))?;
    fs::create_dir_all(dir).map_err(io)?;
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let tmp = dir.join(format!(".{name}.tmp-{}", std::process::id()));
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(serde_json::to_string_pretty(&doc)?.as_bytes())?;
        file.sync_all()?;
        fs::rename(&tmp, &path)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(io(format!("{}: {e}", path.display())));
    }
    Ok(doc)
}

/// Delete a file or a whole folder. Missing is not an error.
pub fn delete_at(base: &Path, rel: &str) -> Result<(), StoreError> {
    let path = resolve(base, rel)?;
    let result = match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => Err(e),
        Ok(m) if m.is_dir() => fs::remove_dir_all(&path),
        Ok(_) => fs::remove_file(&path),
    };
    result.map_err(|e| io(format!("{}: {e}", path.display())))
}

/// Names of the entries in a folder, sorted, without dotfiles (temp files). Missing is empty.
pub fn list_at(base: &Path, rel: &str) -> Result<Vec<String>, StoreError> {
    let path = resolve(base, rel)?;
    let entries = match fs::read_dir(&path) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(io(format!("{}: {e}", path.display()))),
    };
    let mut names: Vec<String> = entries
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|n| !n.starts_with('.'))
        .collect();
    names.sort();
    Ok(names)
}

fn base() -> Result<PathBuf, StoreError> {
    crate::util::lirah_dir().ok_or_else(|| io("no home directory"))
}

async fn run<T: Send + 'static>(
    command: &'static str,
    body: impl FnOnce(PathBuf) -> Result<T, StoreError> + Send + 'static,
) -> Result<T, StoreError> {
    crate::ipc::blocking(command, move || Ok(base().and_then(body)))
        .await
        .map_err(io)?
}

#[tauri::command]
pub async fn store_read(rel: String) -> Result<Option<Value>, StoreError> {
    run("store_read", move |b| read_at(&b, &rel)).await
}

#[tauri::command]
pub async fn store_write(rel: String, data: Value, expected_revision: Option<u64>) -> Result<Value, StoreError> {
    run("store_write", move |b| write_at(&b, &rel, data, expected_revision)).await
}

#[tauri::command]
pub async fn store_delete(rel: String) -> Result<(), StoreError> {
    run("store_delete", move |b| delete_at(&b, &rel)).await
}

#[tauri::command]
pub async fn store_list(rel: String) -> Result<Vec<String>, StoreError> {
    run("store_list", move |b| list_at(&b, &rel)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn temp_base() -> PathBuf {
        static N: AtomicUsize = AtomicUsize::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("lirah-store-test-{}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn round_trip_bumps_revision() {
        let b = temp_base();
        assert_eq!(read_at(&b, "a/settings.json").unwrap(), None);
        let w1 = write_at(&b, "a/settings.json", json!({"x": 1}), Some(0)).unwrap();
        assert_eq!(w1, json!({"x": 1, "version": 1, "revision": 1}));
        assert_eq!(read_at(&b, "a/settings.json").unwrap(), Some(w1));
        let w2 = write_at(&b, "a/settings.json", json!({"x": 2}), Some(1)).unwrap();
        assert_eq!(w2["revision"], 2);
        assert_eq!(read_at(&b, "a/settings.json").unwrap().unwrap()["x"], 2);
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn stale_revision_conflicts_with_current_content() {
        let b = temp_base();
        let w1 = write_at(&b, "t.json", json!({"x": 1}), None).unwrap();
        write_at(&b, "t.json", json!({"x": 2}), Some(1)).unwrap();
        let err = write_at(&b, "t.json", json!({"x": 3}), Some(1)).unwrap_err();
        let current = read_at(&b, "t.json").unwrap();
        assert_eq!(err, StoreError::Conflict { current: current.clone() });
        assert_ne!(current, Some(w1));
        assert_eq!(current.unwrap()["x"], 2);
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn traversal_and_absolute_paths_rejected() {
        let b = temp_base();
        for rel in ["../x.json", "a/../../x.json", "/etc/passwd", "", "./x.json"] {
            assert!(matches!(read_at(&b, rel), Err(StoreError::Io { .. })), "{rel}");
            assert!(matches!(write_at(&b, rel, json!({}), None), Err(StoreError::Io { .. })), "{rel}");
            assert!(matches!(delete_at(&b, rel), Err(StoreError::Io { .. })), "{rel}");
        }
        assert!(!b.exists());
    }

    #[test]
    fn partial_temp_file_is_ignored() {
        let b = temp_base();
        write_at(&b, "t.json", json!({"x": 1}), None).unwrap();
        // A crash mid-write leaves a truncated temp file beside the target.
        fs::write(b.join(".t.json.tmp-999"), "{\"x\": 2, \"rev").unwrap();
        assert_eq!(read_at(&b, "t.json").unwrap().unwrap()["x"], 1);
        assert_eq!(write_at(&b, "t.json", json!({"x": 3}), Some(1)).unwrap()["revision"], 2);
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn delete_removes_folders() {
        let b = temp_base();
        write_at(&b, "workspaces/w1/tasks.json", json!({}), None).unwrap();
        write_at(&b, "workspaces/w1/plans/p1/plan.json", json!({}), None).unwrap();
        write_at(&b, "workspaces/w2/workspace.json", json!({}), None).unwrap();
        assert!(delete_at(&b, "workspaces/w1/../w2").is_err());
        delete_at(&b, "workspaces/w1").unwrap();
        assert!(!b.join("workspaces/w1").exists());
        assert!(b.join("workspaces/w2/workspace.json").exists());
        delete_at(&b, "workspaces/w1").unwrap();
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn list_names_folder_entries() {
        let b = temp_base();
        assert_eq!(list_at(&b, "workspaces/w1/plans").unwrap(), Vec::<String>::new());
        write_at(&b, "workspaces/w1/plans/p2/plan.json", json!({}), None).unwrap();
        write_at(&b, "workspaces/w1/plans/p1/plan.json", json!({}), None).unwrap();
        fs::write(b.join("workspaces/w1/plans/.tmp"), "").unwrap();
        assert_eq!(list_at(&b, "workspaces/w1/plans").unwrap(), vec!["p1", "p2"]);
        assert!(list_at(&b, "../x").is_err());
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn non_object_data_rejected() {
        let b = temp_base();
        assert!(write_at(&b, "t.json", json!([1, 2]), None).is_err());
    }
}
