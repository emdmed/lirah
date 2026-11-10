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

mod backup;

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
    Ok(read_doc(base, rel)?.map(|(doc, _)| doc))
}

/// The migrated file and the schema version it had on disk.
fn read_doc(base: &Path, rel: &str) -> Result<Option<(Value, u64)>, StoreError> {
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
    let disk_version = version;
    for (from, migrate) in MIGRATIONS {
        if *from == version {
            migrate(rel, &mut doc);
            version = from + 1;
        }
    }
    doc.insert("version".into(), version.into());
    Ok(Some((Value::Object(doc), disk_version)))
}

/// Write `data` atomically and return what was written (with the new revision).
pub fn write_at(base: &Path, rel: &str, data: Value, expected_revision: Option<u64>) -> Result<Value, StoreError> {
    let path = resolve(base, rel)?;
    let Value::Object(mut doc) = data else {
        return Err(io("store data must be a JSON object"));
    };
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let (current, disk_version) = match read_doc(base, rel)? {
        Some((doc, version)) => (Some(doc), Some(version)),
        None => (None, None),
    };
    let revision = revision_of(&current);
    if expected_revision.is_some_and(|r| r != revision) {
        return Err(StoreError::Conflict { current });
    }
    // Replacing a file of another schema (a migration, or a newer app's file): keep a copy first.
    if let Some(version) = disk_version.filter(|v| *v != CURRENT_VERSION) {
        let dir = base.join("backups").join(Path::new(rel).parent().unwrap_or(Path::new("")));
        backup::backup(&path, version, &dir).map_err(io)?;
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

/// Append one line to a plain text log (JSON lines, not a store doc), creating
/// it and its folder. One write call per line, with O_APPEND, so writers in
/// other processes (another instance, the CLI) never interleave inside a line.
pub fn append_at(base: &Path, rel: &str, line: &str) -> Result<(), StoreError> {
    if line.contains('\n') {
        return Err(io("store_append takes a single line"));
    }
    let path = resolve(base, rel)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(io)?;
    }
    let mut file = fs::OpenOptions::new().create(true).append(true).open(&path).map_err(io)?;
    file.write_all(format!("{line}\n").as_bytes()).map_err(|e| io(format!("{}: {e}", path.display())))
}

/// A plain text file's contents, or None if it does not exist.
pub fn read_text_at(base: &Path, rel: &str) -> Result<Option<String>, StoreError> {
    match fs::read_to_string(resolve(base, rel)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(io(format!("{rel}: {e}"))),
    }
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

#[tauri::command]
pub async fn store_append(rel: String, line: String) -> Result<(), StoreError> {
    run("store_append", move |b| append_at(&b, &rel, &line)).await
}

#[tauri::command]
pub async fn store_read_text(rel: String) -> Result<Option<String>, StoreError> {
    run("store_read_text", move |b| read_text_at(&b, &rel)).await
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
    fn replacing_another_schema_backs_up_the_old_file() {
        let b = temp_base();
        fs::create_dir_all(b.join("w")).unwrap();
        let old = r#"{"version": 0, "x": 1}"#;
        fs::write(b.join("w/t.json"), old).unwrap();

        write_at(&b, "w/t.json", json!({"x": 2}), None).unwrap();

        let kept: Vec<_> = fs::read_dir(b.join("backups/w")).unwrap().map(|e| e.unwrap().path()).collect();
        assert_eq!(kept.len(), 1);
        assert!(kept[0].file_name().unwrap().to_str().unwrap().starts_with("t.v0."));
        assert_eq!(fs::read_to_string(&kept[0]).unwrap(), old);
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn two_writers_with_the_same_revision_cannot_both_win() {
        let b = temp_base();
        let start = std::sync::Barrier::new(2);
        let results: Vec<_> = std::thread::scope(|scope| {
            let writers: Vec<_> = (0..2)
                .map(|n| {
                    let (b, start) = (&b, &start);
                    scope.spawn(move || {
                        start.wait();
                        write_at(b, "t.json", json!({ "n": n }), Some(0))
                    })
                })
                .collect();
            writers.into_iter().map(|w| w.join().unwrap()).collect()
        });
        assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
        assert!(results.iter().any(|r| matches!(r, Err(StoreError::Conflict { .. }))));
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn corrupt_file_is_an_error_and_is_not_overwritten() {
        let b = temp_base();
        fs::create_dir_all(&b).unwrap();
        fs::write(b.join("t.json"), "{ not json").unwrap();
        assert!(matches!(read_at(&b, "t.json"), Err(StoreError::Io { .. })));
        assert!(write_at(&b, "t.json", json!({"x": 1}), None).is_err());
        assert_eq!(fs::read_to_string(b.join("t.json")).unwrap(), "{ not json");
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn same_schema_write_makes_no_backup() {
        let b = temp_base();
        write_at(&b, "t.json", json!({"x": 1}), None).unwrap();
        write_at(&b, "t.json", json!({"x": 2}), Some(1)).unwrap();
        assert!(!b.join("backups").exists());
        fs::remove_dir_all(&b).unwrap();
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

    #[test]
    fn appends_lines_and_reads_them_back() {
        let b = temp_base();
        assert_eq!(read_text_at(&b, "worklog/2026-11.jsonl").unwrap(), None);
        append_at(&b, "worklog/2026-11.jsonl", r#"{"a":1}"#).unwrap();
        append_at(&b, "worklog/2026-11.jsonl", r#"{"a":2}"#).unwrap();
        assert_eq!(read_text_at(&b, "worklog/2026-11.jsonl").unwrap().as_deref(), Some("{\"a\":1}\n{\"a\":2}\n"));
        assert!(append_at(&b, "worklog/x.jsonl", "two\nlines").is_err());
        assert!(append_at(&b, "../x.jsonl", "{}").is_err());
    }

}
