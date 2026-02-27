use crate::instance_sync::types::{InstanceState, InstanceUpdate};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct InstanceSyncStore {
    instance_id: String,
    base_dir: PathBuf,
}

impl InstanceSyncStore {
    pub fn new() -> Self {
        let instance_id = uuid::Uuid::new_v4().to_string();
        let base_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".lirah")
            .join("instances");

        // Ensure directory exists
        let _ = fs::create_dir_all(&base_dir);

        Self {
            instance_id,
            base_dir,
        }
    }

    pub fn get_instance_id(&self) -> &str {
        &self.instance_id
    }

    pub fn get_state_path(&self) -> PathBuf {
        self.base_dir.join(format!("{}.json", self.instance_id))
    }

    pub fn get_all_instances_path(&self) -> PathBuf {
        self.base_dir.clone()
    }
}

pub fn create_instance_sync_store() -> Arc<Mutex<InstanceSyncStore>> {
    Arc::new(Mutex::new(InstanceSyncStore::new()))
}

#[tauri::command]
pub fn get_instance_id(store: State<'_, Arc<Mutex<InstanceSyncStore>>>) -> Result<String, String> {
    let store = store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_instance_id().to_string())
}

#[tauri::command]
pub fn register_instance(
    project_path: String,
    store: State<'_, Arc<Mutex<InstanceSyncStore>>>,
) -> Result<InstanceState, String> {
    let store = store.lock().map_err(|e| e.to_string())?;

    let state = InstanceState::new(store.get_instance_id().to_string(), project_path);

    let state_path = store.get_state_path();
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(&state_path, json).map_err(|e| e.to_string())?;

    Ok(state)
}

#[tauri::command]
pub fn update_instance_state(
    update: InstanceUpdate,
    store: State<'_, Arc<Mutex<InstanceSyncStore>>>,
) -> Result<InstanceState, String> {
    let store = store.lock().map_err(|e| e.to_string())?;
    let state_path = store.get_state_path();

    // Read current state
    let mut state: InstanceState = if state_path.exists() {
        let content = fs::read_to_string(&state_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    } else {
        return Err("Instance not registered".to_string());
    };

    // Apply updates
    if let Some(project_path) = update.project_path {
        state.project_path = project_path;
        state.project_name = std::path::Path::new(&state.project_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();
    }
    if let Some(focus) = update.current_focus {
        state.current_focus = focus;
    }
    if let Some(files) = update.active_files {
        state.active_files = files;
    }
    if let Some(session_id) = update.claude_session_id {
        state.claude_session_id = session_id;
    }
    if let Some(status) = update.status {
        state.status = status;
    }

    state.last_updated = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Write updated state
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(&state_path, json).map_err(|e| e.to_string())?;

    Ok(state)
}

#[tauri::command]
pub fn get_all_instances(
    store: State<'_, Arc<Mutex<InstanceSyncStore>>>,
) -> Result<Vec<InstanceState>, String> {
    let store = store.lock().map_err(|e| e.to_string())?;
    let base_dir = store.get_all_instances_path();
    let own_id = store.get_instance_id();

    let mut instances = Vec::new();

    if let Ok(entries) = fs::read_dir(&base_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                // Skip own instance
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    if stem == own_id {
                        continue;
                    }
                }

                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(state) = serde_json::from_str::<InstanceState>(&content) {
                        // Filter out stale instances (older than 1 hour)
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();
                        if now - state.last_updated < 3600 {
                            instances.push(state);
                        }
                    }
                }
            }
        }
    }

    Ok(instances)
}

#[tauri::command]
pub fn get_own_instance_state(
    store: State<'_, Arc<Mutex<InstanceSyncStore>>>,
) -> Result<InstanceState, String> {
    let store = store.lock().map_err(|e| e.to_string())?;
    let state_path = store.get_state_path();

    if !state_path.exists() {
        return Err("Instance not registered".to_string());
    }

    let content = fs::read_to_string(&state_path).map_err(|e| e.to_string())?;
    let state: InstanceState = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    Ok(state)
}

#[tauri::command]
pub fn unregister_instance(store: State<'_, Arc<Mutex<InstanceSyncStore>>>) -> Result<(), String> {
    let store = store.lock().map_err(|e| e.to_string())?;
    let state_path = store.get_state_path();

    if state_path.exists() {
        let _ = fs::remove_file(&state_path);
    }

    Ok(())
}

#[tauri::command]
pub fn watch_instances_dir(
    store: State<'_, Arc<Mutex<InstanceSyncStore>>>,
) -> Result<String, String> {
    let store = store.lock().map_err(|e| e.to_string())?;
    let base_dir = store.get_all_instances_path();

    Ok(base_dir.to_string_lossy().to_string())
}
