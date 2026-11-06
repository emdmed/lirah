//! Persisted JSON files under `~/.lirah/`: one envelope, atomic writes and a
//! revision check so a crash or a second writer never loses data.

mod backup;
mod envelope;
mod store;

use envelope::Persisted;
use serde_json::Value;

/// Read a persisted file. `None` when it does not exist yet.
#[tauri::command]
pub async fn read_persisted(path: String) -> Result<Option<Persisted>, String> {
    crate::ipc::blocking("read_persisted", move || store::read(path.as_ref())).await
}

/// Write `data` if the file is still at `expected_revision` (0 for a new file).
/// A stale revision fails with a message starting with `conflict:`.
#[tauri::command]
pub async fn write_persisted(
    path: String,
    version: u32,
    data: Value,
    expected_revision: u64,
) -> Result<Persisted, String> {
    crate::ipc::blocking("write_persisted", move || {
        store::write(path.as_ref(), version, data, expected_revision)
    })
    .await
}

/// Back up a file before a migration rewrites it (the steps run in JS, the
/// write goes through `write_persisted`). Returns the backup path, or `None`
/// when there is no file yet.
#[tauri::command]
pub async fn backup_persisted(path: String) -> Result<Option<String>, String> {
    crate::ipc::blocking("backup_persisted", move || {
        let backup = backup::backup(path.as_ref())?;
        Ok(backup.map(|path| path.to_string_lossy().into_owned()))
    })
    .await
}
