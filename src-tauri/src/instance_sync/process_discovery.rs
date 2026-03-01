use crate::instance_sync::types::{InstanceState, InstanceStatus};
use std::fs;
use std::path::PathBuf;

/// Check if a process is a CLI tool (Claude/OpenCode) and return its working directory
fn check_cli_process(proc_path: &PathBuf, keywords: &[&str], exclude: &[&str]) -> Option<String> {
    let cmdline_path = proc_path.join("cmdline");
    if let Ok(cmdline) = fs::read_to_string(&cmdline_path) {
        let cmdline_lower = cmdline.to_lowercase();

        let matches_keyword = keywords.iter().any(|kw| cmdline_lower.contains(kw));
        let matches_exclude = exclude.iter().any(|ex| cmdline_lower.contains(ex));

        if matches_keyword && !matches_exclude {
            let cwd_path = proc_path.join("cwd");
            if let Ok(cwd) = fs::read_link(&cwd_path) {
                let path_str = cwd.to_string_lossy().to_string();
                if !path_str.starts_with("/home/") {
                    return None;
                }
                // Skip if it's the home directory itself (dynamically detected)
                if let Some(home) = dirs::home_dir() {
                    let home_str = home.to_string_lossy().to_string();
                    if path_str == home_str || path_str == format!("{}/", home_str) {
                        return None;
                    }
                }
                return Some(path_str);
            }
        }
    }
    None
}

/// Discover CLI processes matching given keywords
fn discover_cli_processes(keywords: &[&str], source: &str, id_prefix: &str) -> Vec<InstanceState> {
    let mut instances = Vec::new();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let own_pid = std::process::id();
    let proc_dir = PathBuf::from("/proc");
    let exclude = &["nevo-terminal", "lirah"];

    if let Ok(entries) = fs::read_dir(&proc_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if let Ok(pid) = name.parse::<u32>() {
                    if pid == own_pid {
                        continue;
                    }
                    if let Some(project_path) = check_cli_process(&path, keywords, exclude) {
                        let project_name = PathBuf::from(&project_path)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Unknown")
                            .to_string();

                        instances.push(InstanceState {
                            instance_id: format!("{}-pid-{}", id_prefix, name),
                            project_path,
                            project_name,
                            current_focus: String::new(),
                            active_files: Vec::new(),
                            claude_session_id: None,
                            opencode_session_id: None,
                            source: source.to_string(),
                            last_updated: now,
                            status: InstanceStatus::Active,
                        });
                    }
                }
            }
        }
    }

    instances
}

/// Get all CLI instances (both Claude and OpenCode)
pub fn get_all_cli_instances() -> Vec<InstanceState> {
    let mut instances = Vec::new();

    instances.extend(discover_cli_processes(&["claude"], "claude", "claude"));
    instances.extend(discover_cli_processes(&["opencode", "opncd"], "opencode", "opencode"));

    // Remove duplicates (same project path)
    let mut seen_paths = std::collections::HashSet::new();
    instances.retain(|inst| seen_paths.insert(inst.project_path.clone()));

    instances
}
