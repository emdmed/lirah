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

pub fn workspaces_dir() -> PathBuf {
    crate::util::lirah_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp").join(".lirah"))
        .join("workspaces")
}

/// Link `link` to the directory `target`. Windows only allows symlinks with
/// Developer Mode or admin rights, so it falls back to a junction there.
fn link_dir(target: &Path, link: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, link)
    }
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_dir(target, link).or_else(|symlink_err| {
            junction::create(target, link).map_err(|junction_err| {
                std::io::Error::new(
                    junction_err.kind(),
                    format!("symlink: {symlink_err}; junction: {junction_err}"),
                )
            })
        })
    }
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

        link_dir(target, &link_path).map_err(|e| {
            let _ = fs::remove_dir_all(&ws_dir);
            format!("Failed to link project {}: {}", project_name, e)
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
    delete_workspace_in(&workspaces_dir(), workspace_path)
}

fn delete_workspace_in(root: &Path, workspace_path: &str) -> Result<(), String> {
    let path = Path::new(workspace_path);
    let inside_root = match (path.canonicalize(), root.canonicalize()) {
        (Ok(p), Ok(r)) => p.parent() == Some(r.as_path()),
        _ => false,
    };
    if !inside_root {
        return Err(format!("{workspace_path} is not a workspace of Lirah"));
    }

    let marker = path.join(".lirah-workspace.json");
    let saved = fs::read(&marker).map_err(|_| "Not a valid workspace directory".to_string())?;

    fs::remove_dir_all(path).map_err(|e| {
        // remove_dir_all deletes the marker first; without it the leftover folder is unlisted and cannot be retried.
        if path.exists() {
            let _ = fs::write(&marker, saved);
        }
        format!("Failed to delete workspace: {}", e)
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspaces_dir_is_the_workspaces_folder_of_lirah() {
        assert!(workspaces_dir().ends_with(".lirah/workspaces"));
    }

    /// A scratch folder holding one project, `real`, with a file in it.
    fn scratch(name: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("lirah-ws-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let real = base.join("real");
        fs::create_dir_all(&real).unwrap();
        fs::write(real.join("keep.txt"), "kept").unwrap();
        (base, real)
    }

    #[test]
    fn link_dir_makes_a_link_that_resolves_to_the_project() {
        let (base, real) = scratch("link");
        let link = base.join("link");
        link_dir(&real, &link).unwrap();
        assert_eq!(fs::read_to_string(link.join("keep.txt")).unwrap(), "kept");
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(windows)]
    #[test]
    fn removing_a_junction_leaves_the_project_intact() {
        let (base, real) = scratch("junction");
        let link = base.join("link");
        junction::create(&real, &link).unwrap();
        assert_eq!(fs::read_to_string(link.join("keep.txt")).unwrap(), "kept");

        fs::remove_dir(&link).unwrap();

        assert!(!link.exists());
        assert!(real.join("keep.txt").exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn delete_workspace_rejects_a_folder_outside_the_workspaces_root() {
        let (base, _) = scratch("outside");
        let root = base.join("root");
        fs::create_dir_all(&root).unwrap();
        let other = base.join("other");
        fs::create_dir_all(&other).unwrap();
        fs::write(other.join(".lirah-workspace.json"), "{}").unwrap();

        let err = delete_workspace_in(&root, other.to_str().unwrap()).unwrap_err();

        assert!(err.contains("not a workspace of Lirah"), "{err}");
        assert!(other.join(".lirah-workspace.json").exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(windows)]
    #[test]
    fn a_failed_delete_keeps_the_workspace_listed_and_retryable() {
        let (base, _) = scratch("inuse");
        let ws = base.join("ws");
        fs::create_dir_all(&ws).unwrap();
        fs::write(ws.join(".lirah-workspace.json"), "{}").unwrap();
        // Killed on drop so a failing assert cannot leave it running.
        struct Holder(std::process::Child);
        impl Drop for Holder {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        let holder = Holder(
            std::process::Command::new("ping")
                .args(["-t", "127.0.0.1"])
                .current_dir(&ws)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .unwrap(),
        );
        std::thread::sleep(std::time::Duration::from_millis(500));

        let first = delete_workspace_in(&base, ws.to_str().unwrap());
        let marker_kept = ws.join(".lirah-workspace.json").exists();
        drop(holder);
        let mut retry = delete_workspace_in(&base, ws.to_str().unwrap());
        for _ in 0..20 {
            if retry.is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
            retry = delete_workspace_in(&base, ws.to_str().unwrap());
        }

        assert!(first.is_err());
        assert!(marker_kept, "the failed delete should leave the marker");
        retry.unwrap();
        assert!(!ws.exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn delete_workspace_leaves_the_linked_projects_intact() {
        let (base, real) = scratch("delete");
        let ws = base.join("ws");
        fs::create_dir_all(&ws).unwrap();
        fs::write(ws.join(".lirah-workspace.json"), "{}").unwrap();
        link_dir(&real, &ws.join("linked")).unwrap();
        #[cfg(windows)]
        junction::create(&real, ws.join("junction")).unwrap();

        delete_workspace_in(&base, ws.to_str().unwrap()).unwrap();

        assert!(!ws.exists());
        assert_eq!(fs::read_to_string(real.join("keep.txt")).unwrap(), "kept");
        let _ = fs::remove_dir_all(&base);
    }
}
