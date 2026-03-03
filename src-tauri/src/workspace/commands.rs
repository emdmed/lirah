use crate::state::AppState;
use super::manager;

#[derive(serde::Deserialize)]
pub struct ProjectInput {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
}

#[tauri::command]
pub fn create_workspace(
    name: String,
    projects: Vec<ProjectInput>,
    state: tauri::State<AppState>,
) -> Result<manager::WorkspaceInfo, String> {
    let project_tuples: Vec<(String, String, Option<String>)> = projects
        .into_iter()
        .map(|p| (p.name, p.path, p.description))
        .collect();

    let info = manager::create_workspace(&name, project_tuples)?;

    // Store workspace context in app state
    let path_map = manager::build_path_map(&info.path, &info.projects);
    let mut state_lock = state.lock().map_err(|e| format!("Failed to lock state: {}", e))?;
    state_lock.workspace_context = Some(crate::state::WorkspaceContext {
        workspace_path: info.path.clone(),
        path_map,
    });

    Ok(info)
}

#[tauri::command]
pub fn delete_workspace(workspace_path: String, state: tauri::State<AppState>) -> Result<(), String> {
    manager::delete_workspace(&workspace_path)?;

    // Clear workspace context if it matches
    let mut state_lock = state.lock().map_err(|e| format!("Failed to lock state: {}", e))?;
    if let Some(ctx) = &state_lock.workspace_context {
        if ctx.workspace_path == workspace_path {
            state_lock.workspace_context = None;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn list_workspaces() -> Result<Vec<manager::WorkspaceInfo>, String> {
    manager::list_workspaces()
}

#[tauri::command]
pub fn open_workspace(workspace_path: String, state: tauri::State<AppState>) -> Result<manager::WorkspaceInfo, String> {
    // Read workspace metadata
    let metadata_path = std::path::Path::new(&workspace_path).join(".lirah-workspace.json");
    let content = std::fs::read_to_string(&metadata_path)
        .map_err(|e| format!("Failed to read workspace metadata: {}", e))?;
    let meta: manager::WorkspaceMetadata = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse workspace metadata: {}", e))?;

    let info = manager::WorkspaceInfo {
        id: meta.id,
        name: meta.name,
        path: workspace_path.clone(),
        projects: meta.projects.clone(),
    };

    // Set workspace context
    let path_map = manager::build_path_map(&workspace_path, &meta.projects);
    let mut state_lock = state.lock().map_err(|e| format!("Failed to lock state: {}", e))?;
    state_lock.workspace_context = Some(crate::state::WorkspaceContext {
        workspace_path,
        path_map,
    });

    Ok(info)
}

#[tauri::command]
pub fn close_workspace(state: tauri::State<AppState>) -> Result<(), String> {
    let mut state_lock = state.lock().map_err(|e| format!("Failed to lock state: {}", e))?;
    state_lock.workspace_context = None;
    Ok(())
}
