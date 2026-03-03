use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMetadata {
    pub id: String,
    pub name: String,
    pub projects: Vec<WorkspaceProject>,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceProject {
    pub name: String,
    pub real_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub projects: Vec<WorkspaceProject>,
}

fn workspaces_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".lirah")
        .join("workspaces")
}

pub fn create_workspace(name: &str, projects: Vec<(String, String, Option<String>)>) -> Result<WorkspaceInfo, String> {
    let id = Uuid::new_v4().to_string();
    let ws_dir = workspaces_dir().join(format!("ws-{}", &id[..8]));

    fs::create_dir_all(&ws_dir)
        .map_err(|e| format!("Failed to create workspace directory: {}", e))?;

    let mut workspace_projects = Vec::new();

    for (project_name, real_path, _description) in &projects {
        let link_path = ws_dir.join(project_name);
        let target = Path::new(real_path);

        if !target.exists() {
            let _ = fs::remove_dir_all(&ws_dir);
            return Err(format!("Project path does not exist: {}", real_path));
        }

        #[cfg(unix)]
        std::os::unix::fs::symlink(target, &link_path)
            .map_err(|e| {
                let _ = fs::remove_dir_all(&ws_dir);
                format!("Failed to create symlink for {}: {}", project_name, e)
            })?;

        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(target, &link_path)
            .map_err(|e| {
                let _ = fs::remove_dir_all(&ws_dir);
                format!("Failed to create symlink for {}: {}", project_name, e)
            })?;

        workspace_projects.push(WorkspaceProject {
            name: project_name.clone(),
            real_path: real_path.clone(),
        });
    }

    // Generate CLAUDE.md for workspace awareness
    let mut claude_md = format!("# Workspace: {}\n\nThis is a multi-project workspace. It contains:\n\n", name);
    for (project_name, real_path, description) in &projects {
        let desc = description.as_deref().unwrap_or(real_path.as_str());
        claude_md.push_str(&format!("- `{}/` — {}\n", project_name, desc));
    }
    claude_md.push_str("\nYou can `cd <project>` to work in each project.\nEach project has its own git repo and may have its own CLAUDE.md.\n");

    fs::write(ws_dir.join("CLAUDE.md"), &claude_md)
        .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    let metadata = WorkspaceMetadata {
        id: id.clone(),
        name: name.to_string(),
        projects: workspace_projects.clone(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    };

    let metadata_path = ws_dir.join(".lirah-workspace.json");
    let json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
    fs::write(&metadata_path, json)
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(WorkspaceInfo {
        id,
        name: name.to_string(),
        path: ws_dir.to_string_lossy().to_string(),
        projects: workspace_projects,
    })
}

pub fn delete_workspace(workspace_path: &str) -> Result<(), String> {
    let path = Path::new(workspace_path);

    // Verify it's actually a workspace
    if !path.join(".lirah-workspace.json").exists() {
        return Err("Not a valid workspace directory".to_string());
    }

    fs::remove_dir_all(path)
        .map_err(|e| format!("Failed to delete workspace: {}", e))
}

pub fn list_workspaces() -> Result<Vec<WorkspaceInfo>, String> {
    let ws_dir = workspaces_dir();
    if !ws_dir.exists() {
        return Ok(vec![]);
    }

    let mut workspaces = Vec::new();

    let entries = fs::read_dir(&ws_dir)
        .map_err(|e| format!("Failed to read workspaces directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let metadata_path = path.join(".lirah-workspace.json");

        if metadata_path.exists() {
            if let Ok(content) = fs::read_to_string(&metadata_path) {
                if let Ok(meta) = serde_json::from_str::<WorkspaceMetadata>(&content) {
                    workspaces.push(WorkspaceInfo {
                        id: meta.id,
                        name: meta.name,
                        path: path.to_string_lossy().to_string(),
                        projects: meta.projects,
                    });
                }
            }
        }
    }

    Ok(workspaces)
}

/// Build a map of real_path -> symlink_path for CWD translation
pub fn build_path_map(workspace_path: &str, projects: &[WorkspaceProject]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for project in projects {
        // Canonicalize the real path to handle any symlink resolution
        let real = fs::canonicalize(&project.real_path)
            .unwrap_or_else(|_| PathBuf::from(&project.real_path));
        let symlink_path = format!("{}/{}", workspace_path, project.name);
        map.insert(real.to_string_lossy().to_string(), symlink_path);
    }
    map
}

/// Translate a real path to its workspace-relative symlink path
pub fn translate_path(real_path: &str, path_map: &HashMap<String, String>) -> String {
    for (real_prefix, symlink_prefix) in path_map {
        if real_path.starts_with(real_prefix) {
            return real_path.replacen(real_prefix, symlink_prefix, 1);
        }
    }
    real_path.to_string()
}
