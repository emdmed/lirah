use crate::opencode::types::{
    OpencodeMessage, OpencodeMessageInfo, OpencodePartInfo, OpencodeProjectInfo, OpencodeSession,
    OpencodeSessionEntry, OpencodeSessionInfo, OpencodeSessionsPage,
};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Environment variable override for OpenCode data directory
const OPENCODE_DATA_ENV: &str = "OPENCODE_DATA_DIR";

/// Default locations for OpenCode data directory
const OPENCODE_DATA_LOCATIONS: &[&str] = &[".local/share/opencode"];

/// Find the OpenCode data directory
fn find_opencode_data_dir() -> Option<PathBuf> {
    // 1. Check environment variable override first
    if let Ok(env_path) = std::env::var(OPENCODE_DATA_ENV) {
        let path = PathBuf::from(env_path);
        if path.exists() {
            return Some(path);
        }
    }

    // 2. Get home directory
    let home_dir = dirs::home_dir()?;

    // 3. Try each location in priority order
    for location in OPENCODE_DATA_LOCATIONS {
        let path = home_dir.join(location);
        if path.exists() && path.is_dir() {
            // Verify it has a "storage" subdirectory
            let storage_dir = path.join("storage");
            if storage_dir.exists() && storage_dir.is_dir() {
                return Some(path);
            }
        }
    }

    None
}

/// Get all possible OpenCode data paths for debugging
#[tauri::command]
pub fn get_opencode_data_paths() -> Result<Vec<String>, String> {
    let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;

    let mut paths = Vec::new();

    // Add env var path if set
    if let Ok(env_path) = std::env::var(OPENCODE_DATA_ENV) {
        paths.push(format!("ENV[{}]: {}", OPENCODE_DATA_ENV, env_path));
    }

    // Add all standard locations
    for location in OPENCODE_DATA_LOCATIONS {
        let full_path = home_dir.join(location);
        let exists = full_path.exists();
        let has_storage = full_path.join("storage").exists();
        paths.push(format!(
            "{}{}{}",
            full_path.to_string_lossy(),
            if exists { " [EXISTS]" } else { "" },
            if has_storage { " [VALID]" } else { "" }
        ));
    }

    Ok(paths)
}

/// Find project ID from project path by scanning project files
fn find_project_id(opencode_dir: &PathBuf, project_path: &str) -> Option<String> {
    let projects_dir = opencode_dir.join("storage").join("project");

    if !projects_dir.exists() {
        return None;
    }

    // Normalize project path for comparison
    let normalized_path = std::path::Path::new(project_path)
        .canonicalize()
        .ok()?
        .to_string_lossy()
        .to_string();

    // Scan all project files
    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(project) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(worktree) = project.get("worktree").and_then(|w| w.as_str()) {
                            // Normalize worktree path
                            if let Ok(normalized_worktree) =
                                std::path::Path::new(worktree).canonicalize()
                            {
                                if normalized_worktree.to_string_lossy() == normalized_path {
                                    return project
                                        .get("id")
                                        .and_then(|i| i.as_str())
                                        .map(|s| s.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// Get project ID from path using git root commit hash
fn get_project_id_from_git(project_path: &str) -> Option<String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(["-C", project_path, "rev-parse", "HEAD"])
        .output()
        .ok()?;

    if output.status.success() {
        let hash = String::from_utf8(output.stdout).ok()?;
        return Some(hash.trim().to_string());
    }

    None
}

/// Format unix milliseconds as ISO 8601 string
fn format_unix_ms_as_iso(ms: u64) -> String {
    let secs = ms / 1000;
    let millis = ms % 1000;
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    // Calculate date/time from unix timestamp
    let mut y = 1970i64;
    let mut remaining = days as i64;
    loop {
        let days_in_year = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) {
            366
        } else {
            365
        };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut m = 0usize;
    for md in &month_days {
        if remaining < *md as i64 {
            break;
        }
        remaining -= *md as i64;
        m += 1;
    }

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y,
        m + 1,
        remaining + 1,
        hours,
        minutes,
        seconds,
        millis
    )
}

/// Build session entry from session info file
fn build_session_entry(
    session_path: &std::path::Path,
    session_id: &str,
    project_path: &str,
) -> Result<OpencodeSessionEntry, String> {
    let content = fs::read_to_string(session_path).map_err(|e| e.to_string())?;
    let session_info: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let title = session_info
        .get("title")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    let slug = session_info
        .get("slug")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();

    let created_ms = session_info
        .get("time")
        .and_then(|t| t.get("created"))
        .and_then(|c| c.as_u64())
        .unwrap_or(0);

    let modified_ms = session_info
        .get("time")
        .and_then(|t| t.get("updated"))
        .and_then(|u| u.as_u64())
        .unwrap_or(0);

    let is_fork = session_info.get("parentID").is_some();

    // Count messages by scanning message directory
    let message_count = count_messages_for_session(session_id);

    // Build summary from summary field
    let summary = session_info
        .get("summary")
        .and_then(|s| {
            let additions = s.get("additions").and_then(|a| a.as_i64()).unwrap_or(0);
            let deletions = s.get("deletions").and_then(|d| d.as_i64()).unwrap_or(0);
            let files = s.get("files").and_then(|f| f.as_i64()).unwrap_or(0);

            if files > 0 {
                Some(format!("+{} -{} ({} files)", additions, deletions, files))
            } else {
                None
            }
        })
        .unwrap_or_default();

    // Get first prompt - we'll need to read messages
    let first_prompt = get_first_prompt_for_session(session_id).unwrap_or_default();

    Ok(OpencodeSessionEntry {
        session_id: session_id.to_string(),
        full_path: session_path.to_string_lossy().to_string(),
        first_prompt,
        summary,
        message_count,
        created: format_unix_ms_as_iso(created_ms),
        modified: format_unix_ms_as_iso(modified_ms),
        git_branch: None, // OpenCode doesn't store git branch in session
        project_path: project_path.to_string(),
        is_fork,
        title,
        slug,
    })
}

/// Count messages for a session
fn count_messages_for_session(session_id: &str) -> i32 {
    let opencode_dir = match find_opencode_data_dir() {
        Some(dir) => dir,
        None => return 0,
    };

    let messages_dir = opencode_dir
        .join("storage")
        .join("message")
        .join(session_id);

    if !messages_dir.exists() {
        return 0;
    }

    match fs::read_dir(&messages_dir) {
        Ok(entries) => entries.count() as i32,
        Err(_) => 0,
    }
}

/// Get first user prompt for a session
fn get_first_prompt_for_session(session_id: &str) -> Option<String> {
    let opencode_dir = find_opencode_data_dir()?;

    let messages_dir = opencode_dir
        .join("storage")
        .join("message")
        .join(session_id);

    if !messages_dir.exists() {
        return None;
    }

    // Read all message files and find first user message
    let mut user_messages: Vec<(String, u64)> = Vec::new();

    if let Ok(entries) = fs::read_dir(&messages_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(message) = serde_json::from_str::<serde_json::Value>(&content) {
                        let role = message.get("role").and_then(|r| r.as_str()).unwrap_or("");
                        let created = message
                            .get("time")
                            .and_then(|t| t.get("created"))
                            .and_then(|c| c.as_u64())
                            .unwrap_or(0);

                        if role == "user" {
                            // Extract content from parts
                            let message_id = path
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("")
                                .to_string();
                            user_messages.push((message_id, created));
                        }
                    }
                }
            }
        }
    }

    // Sort by creation time
    user_messages.sort_by_key(|(_, created)| *created);

    // Get first user message content
    if let Some((first_id, _)) = user_messages.first() {
        return get_message_content(first_id, session_id);
    }

    None
}

/// Get message content by reading parts
fn get_message_content(message_id: &str, _session_id: &str) -> Option<String> {
    let opencode_dir = find_opencode_data_dir()?;

    let parts_dir = opencode_dir.join("storage").join("part").join(message_id);

    if !parts_dir.exists() {
        return None;
    }

    let mut text_parts: Vec<String> = Vec::new();

    if let Ok(entries) = fs::read_dir(&parts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(part) = serde_json::from_str::<serde_json::Value>(&content) {
                        let part_type = part.get("type").and_then(|t| t.as_str()).unwrap_or("");

                        if part_type == "text" {
                            if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                text_parts.push(text.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    if text_parts.is_empty() {
        None
    } else {
        Some(text_parts.join("\n").chars().take(200).collect())
    }
}

/// Get all OpenCode sessions for a project (paginated)
#[tauri::command]
pub fn get_opencode_sessions(
    project_path: String,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<OpencodeSessionsPage, String> {
    let limit = limit.unwrap_or(20);
    let offset = offset.unwrap_or(0);

    eprintln!(
        "\n[OpenCode Sessions] Requesting sessions for: {} (limit={}, offset={})",
        project_path, limit, offset
    );

    // Find OpenCode data directory
    let opencode_dir = find_opencode_data_dir().ok_or_else(|| {
        let msg = format!(
            "Could not find OpenCode data directory.\n\n\
            Tried locations:\n{}\n\n\
            Set {} environment variable to override.",
            OPENCODE_DATA_LOCATIONS.join("\n"),
            OPENCODE_DATA_ENV
        );
        eprintln!("[OpenCode Sessions] ERROR: {}", msg);
        msg
    })?;

    // Find project ID from path
    let project_id = find_project_id(&opencode_dir, &project_path)
        .or_else(|| get_project_id_from_git(&project_path))
        .ok_or_else(|| {
            let msg = format!("Could not find OpenCode project for path: {}", project_path);
            eprintln!("[OpenCode Sessions] ERROR: {}", msg);
            msg
        })?;

    eprintln!("[OpenCode Sessions] Found project ID: {}", project_id);

    // List sessions directory
    let sessions_dir = opencode_dir
        .join("storage")
        .join("session")
        .join(&project_id);

    eprintln!(
        "[OpenCode Sessions] Looking for sessions in: {:?}",
        sessions_dir
    );

    if !sessions_dir.exists() {
        eprintln!(
            "[OpenCode Sessions] Sessions directory not found at: {:?}",
            sessions_dir
        );
        return Ok(OpencodeSessionsPage {
            sessions: Vec::new(),
            total: 0,
            has_more: false,
        });
    }

    let mut sessions = Vec::new();

    if let Ok(entries) = fs::read_dir(&sessions_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    let session_id = stem.to_string();

                    if let Ok(entry) = build_session_entry(&path, &session_id, &project_path) {
                        sessions.push(entry);
                    }
                }
            }
        }
    }

    // Sort by modified date (most recent first)
    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));

    let total = sessions.len();

    // Apply pagination
    let paginated: Vec<OpencodeSessionEntry> =
        sessions.into_iter().skip(offset).take(limit).collect();

    let has_more = offset + paginated.len() < total;

    eprintln!(
        "[OpenCode Sessions] Returning {} of {} sessions (offset={}, limit={}, has_more={})",
        paginated.len(),
        total,
        offset,
        limit,
        has_more
    );

    Ok(OpencodeSessionsPage {
        sessions: paginated,
        total,
        has_more,
    })
}

/// Get a specific OpenCode session with its messages
#[tauri::command]
pub fn get_opencode_session(
    session_id: String,
    project_path: String,
) -> Result<OpencodeSession, String> {
    eprintln!(
        "\n[OpenCode Session] Requesting session: {} for project: {}",
        session_id, project_path
    );

    // Find OpenCode data directory
    let opencode_dir = find_opencode_data_dir().ok_or("Could not find OpenCode data directory")?;

    // Find project ID
    let project_id = find_project_id(&opencode_dir, &project_path)
        .or_else(|| get_project_id_from_git(&project_path))
        .ok_or("Could not find OpenCode project for path")?;

    // Read session metadata
    let session_file = opencode_dir
        .join("storage")
        .join("session")
        .join(&project_id)
        .join(format!("{}.json", session_id));

    eprintln!("[OpenCode Session] Looking for: {:?}", session_file);

    if !session_file.exists() {
        let msg = format!("Session file not found: {:?}", session_file);
        eprintln!("[OpenCode Session] ERROR: {}", msg);
        return Err(msg);
    }

    let session_content = fs::read_to_string(&session_file).map_err(|e| {
        let msg = format!("Failed to read session file: {}", e);
        eprintln!("[OpenCode Session] ERROR: {}", msg);
        msg
    })?;

    let session_info: serde_json::Value = serde_json::from_str(&session_content).map_err(|e| {
        let msg = format!("Failed to parse session: {}", e);
        eprintln!("[OpenCode Session] ERROR: {}", msg);
        msg
    })?;

    let summary = session_info
        .get("title")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());

    // Read all messages for this session
    let messages_dir = opencode_dir
        .join("storage")
        .join("message")
        .join(&session_id);

    let mut messages: Vec<OpencodeMessage> = Vec::new();

    if messages_dir.exists() {
        if let Ok(entries) = fs::read_dir(&messages_dir) {
            let mut message_entries: Vec<(String, String, u64)> = Vec::new(); // (id, role, created)

            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json") {
                    if let Some(message_id) = path.file_stem().and_then(|s| s.to_str()) {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Ok(message) = serde_json::from_str::<serde_json::Value>(&content)
                            {
                                let role = message
                                    .get("role")
                                    .and_then(|r| r.as_str())
                                    .unwrap_or("user")
                                    .to_string();

                                let created = message
                                    .get("time")
                                    .and_then(|t| t.get("created"))
                                    .and_then(|c| c.as_u64())
                                    .unwrap_or(0);

                                message_entries.push((message_id.to_string(), role, created));
                            }
                        }
                    }
                }
            }

            // Sort by creation time ascending
            message_entries.sort_by_key(|(_, _, created)| *created);

            // Build messages with content from parts
            for (message_id, role, created) in message_entries {
                if let Some(content) = get_message_content(&message_id, &session_id) {
                    let timestamp = Some(format_unix_ms_as_iso(created));

                    messages.push(OpencodeMessage {
                        role,
                        content,
                        timestamp,
                    });
                }
            }
        }
    }

    eprintln!("[OpenCode Session] Parsed {} messages", messages.len());

    Ok(OpencodeSession {
        session_id,
        messages,
        summary,
        project_path,
    })
}

/// Get the most recent active session for a project
#[tauri::command]
pub fn get_active_opencode_session(
    project_path: String,
) -> Result<Option<OpencodeSessionEntry>, String> {
    let page = get_opencode_sessions(project_path, Some(1), Some(0))?;

    // Return the first (most recent) session
    Ok(page.sessions.into_iter().next())
}

/// Get all active OpenCode instances (projects with recent activity)
#[tauri::command]
pub fn get_opencode_instances() -> Result<Vec<crate::instance_sync::types::InstanceState>, String> {
    use crate::instance_sync::types::{InstanceState, InstanceStatus};

    let opencode_dir = match find_opencode_data_dir() {
        Some(dir) => dir,
        None => return Ok(Vec::new()),
    };

    let projects_dir = opencode_dir.join("storage").join("project");
    let sessions_base_dir = opencode_dir.join("storage").join("session");

    if !projects_dir.exists() {
        return Ok(Vec::new());
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut instances = Vec::new();

    // Scan all projects
    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Some(project_id) = path.file_stem().and_then(|s| s.to_str()) {
                    // Skip "global" project
                    if project_id == "global" {
                        continue;
                    }

                    // Read project info
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(project) = serde_json::from_str::<serde_json::Value>(&content) {
                            let worktree = project
                                .get("worktree")
                                .and_then(|w| w.as_str())
                                .unwrap_or("")
                                .to_string();

                            if worktree.is_empty() {
                                continue;
                            }

                            // Check if project has recent sessions
                            let sessions_dir = sessions_base_dir.join(project_id);
                            if !sessions_dir.exists() {
                                continue;
                            }

                            // Find most recent session
                            let mut most_recent_time: u64 = 0;
                            let mut recent_session_id: Option<String> = None;

                            if let Ok(session_entries) = fs::read_dir(&sessions_dir) {
                                for session_entry in session_entries.flatten() {
                                    let session_path = session_entry.path();
                                    if session_path.extension().and_then(|e| e.to_str())
                                        == Some("json")
                                    {
                                        if let Some(session_id) =
                                            session_path.file_stem().and_then(|s| s.to_str())
                                        {
                                            if let Ok(session_content) =
                                                fs::read_to_string(&session_path)
                                            {
                                                if let Ok(session) =
                                                    serde_json::from_str::<serde_json::Value>(
                                                        &session_content,
                                                    )
                                                {
                                                    let updated = session
                                                        .get("time")
                                                        .and_then(|t| t.get("updated"))
                                                        .and_then(|u| u.as_u64())
                                                        .unwrap_or(0);

                                                    if updated > most_recent_time {
                                                        most_recent_time = updated;
                                                        recent_session_id =
                                                            Some(session_id.to_string());
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Only include if has recent activity (< 1 hour)
                            let last_updated_sec = most_recent_time / 1000;
                            let age = now - last_updated_sec;

                            if age < 3600 && recent_session_id.is_some() {
                                let project_name = std::path::Path::new(&worktree)
                                    .file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("Unknown")
                                    .to_string();

                                instances.push(InstanceState {
                                    instance_id: format!("opencode-{}", project_id),
                                    project_path: worktree,
                                    project_name,
                                    current_focus: String::new(),
                                    active_files: Vec::new(),
                                    claude_session_id: None,
                                    opencode_session_id: recent_session_id,
                                    source: "opencode".to_string(),
                                    last_updated: last_updated_sec,
                                    status: InstanceStatus::Active,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(instances)
}
