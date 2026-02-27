use crate::instance_sync::types::{InstanceState, InstanceStatus};
use std::fs;
use std::path::PathBuf;

/// Find running Claude Code CLI processes
pub fn discover_claude_processes() -> Vec<InstanceState> {
    let mut instances = Vec::new();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Get current PID to exclude ourselves
    let own_pid = std::process::id();

    // Scan /proc for processes
    let proc_dir = PathBuf::from("/proc");

    if let Ok(entries) = fs::read_dir(&proc_dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            // Check if entry is a PID directory (numeric)
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if let Ok(pid) = name.parse::<u32>() {
                    // Skip our own process
                    if pid == own_pid {
                        continue;
                    }

                    // Check if this is a Claude process
                    if let Some(project_path) = check_claude_process(&path) {
                        let project_name = PathBuf::from(&project_path)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Unknown")
                            .to_string();

                        instances.push(InstanceState {
                            instance_id: format!("claude-pid-{}", name),
                            project_path,
                            project_name,
                            current_focus: String::new(),
                            active_files: Vec::new(),
                            claude_session_id: None,
                            opencode_session_id: None,
                            source: "claude".to_string(),
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

/// Find running OpenCode CLI processes
pub fn discover_opencode_processes() -> Vec<InstanceState> {
    let mut instances = Vec::new();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Get current PID to exclude ourselves
    let own_pid = std::process::id();

    // Scan /proc for processes
    let proc_dir = PathBuf::from("/proc");

    if let Ok(entries) = fs::read_dir(&proc_dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            // Check if entry is a PID directory (numeric)
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if let Ok(pid) = name.parse::<u32>() {
                    // Skip our own process
                    if pid == own_pid {
                        continue;
                    }

                    // Check if this is an OpenCode process
                    if let Some(project_path) = check_opencode_process(&path) {
                        let project_name = PathBuf::from(&project_path)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Unknown")
                            .to_string();

                        instances.push(InstanceState {
                            instance_id: format!("opencode-pid-{}", name),
                            project_path,
                            project_name,
                            current_focus: String::new(),
                            active_files: Vec::new(),
                            claude_session_id: None,
                            opencode_session_id: None,
                            source: "opencode".to_string(),
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

/// Check if a process is Claude Code and return its working directory
fn check_claude_process(proc_path: &PathBuf) -> Option<String> {
    // Read cmdline to check if this is claude
    let cmdline_path = proc_path.join("cmdline");
    if let Ok(cmdline) = fs::read_to_string(&cmdline_path) {
        // Check if cmdline contains "claude" but exclude our own Lirah process
        let cmdline_lower = cmdline.to_lowercase();
        if cmdline_lower.contains("claude")
            && !cmdline_lower.contains("nevo-terminal")
            && !cmdline_lower.contains("lirah")
        {
            // Get working directory
            let cwd_path = proc_path.join("cwd");
            if let Ok(cwd) = fs::read_link(&cwd_path) {
                let path_str = cwd.to_string_lossy().to_string();
                // Skip system directories
                if !path_str.starts_with("/home/") {
                    return None;
                }
                // Skip if it's the home directory itself
                if path_str == "/home/enrique" || path_str == "/home/enrique/" {
                    return None;
                }
                return Some(path_str);
            }
        }
    }
    None
}

/// Check if a process is OpenCode and return its working directory
fn check_opencode_process(proc_path: &PathBuf) -> Option<String> {
    // Read cmdline to check if this is opencode
    let cmdline_path = proc_path.join("cmdline");
    if let Ok(cmdline) = fs::read_to_string(&cmdline_path) {
        // Check if cmdline contains "opencode" or "opncd" but exclude our own process
        let cmdline_lower = cmdline.to_lowercase();
        if (cmdline_lower.contains("opencode") || cmdline_lower.contains("opncd"))
            && !cmdline_lower.contains("nevo-terminal")
            && !cmdline_lower.contains("lirah")
        {
            // Get working directory
            let cwd_path = proc_path.join("cwd");
            if let Ok(cwd) = fs::read_link(&cwd_path) {
                let path_str = cwd.to_string_lossy().to_string();
                // Skip system directories
                if !path_str.starts_with("/home/") {
                    return None;
                }
                // Skip if it's the home directory itself
                if path_str == "/home/enrique" || path_str == "/home/enrique/" {
                    return None;
                }
                return Some(path_str);
            }
        }
    }
    None
}

/// Get all CLI instances (both Claude and OpenCode)
pub fn get_all_cli_instances() -> Vec<InstanceState> {
    let mut instances = Vec::new();

    // Discover Claude processes
    instances.extend(discover_claude_processes());

    // Discover OpenCode processes
    instances.extend(discover_opencode_processes());

    // Remove duplicates (same project path)
    let mut seen_paths = std::collections::HashSet::new();
    instances.retain(|inst| {
        if seen_paths.contains(&inst.project_path) {
            false
        } else {
            seen_paths.insert(inst.project_path.clone());
            true
        }
    });

    instances
}
