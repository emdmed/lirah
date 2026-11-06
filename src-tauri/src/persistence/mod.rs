//! Persisted JSON files under `~/.lirah/`: one envelope, atomic writes and a
//! revision check so a crash or a second writer never loses data.

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
