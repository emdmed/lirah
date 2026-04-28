use crate::claude::types::{ClaudeMessage, ClaudeSession, ClaudeSessionEntry, ClaudeSessionsPage, SubagentInfo, SubagentStatus};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Cached result of Claude data directory discovery (retries on None)
static CLAUDE_DATA_DIR_CACHE: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Environment variable override for Claude data directory
const CLAUDE_DATA_ENV: &str = "CLAUDE_CODE_DATA_DIR";

/// Possible locations for Claude Code data directory (in priority order)
const CLAUDE_DATA_LOCATIONS: &[&str] = &[
    ".claude",                                   // Standard npm/npx install
    ".config/claude-code",                       // XDG config directory (newer)
    ".config/claude",                            // XDG config directory (older)
    ".local/share/claude-code",                  // XDG data directory
    ".local/share/claude",                       // XDG data directory (older)
    ".var/app/com.anthropic.claude/data/claude", // Flatpak
    ".snap/claude-code/current/.claude",         // Snap (newer)
    ".snap/claude/current/.claude",              // Snap (older)
    "snap/claude-code/current/.claude",          // Snap (no dot prefix)
    ".npm/_npx/<hash>/node_modules/@anthropic-ai/claude-code/.claude", // npx global
];

/// Find the Claude Code data directory by trying multiple locations
/// Caches successful results; retries on failure (dir may appear later)
fn find_claude_data_dir() -> Option<PathBuf> {
    let cached = CLAUDE_DATA_DIR_CACHE.lock().ok()?.clone();
    if let Some(path) = &cached {
        if path.exists() {
            return Some(path.clone());
        }
    }
    // Not cached or cached path vanished — rediscover
    let found = discover_claude_data_dir();
    if let Ok(mut guard) = CLAUDE_DATA_DIR_CACHE.lock() {
        *guard = found.clone();
    }
    found
}

/// Perform the actual filesystem discovery for Claude data directory
fn discover_claude_data_dir() -> Option<PathBuf> {
    // 1. Check environment variable override first
    if let Ok(env_path) = env::var(CLAUDE_DATA_ENV) {
        let path = PathBuf::from(env_path);
        if path.exists() {
            return Some(path);
        }
    }

    // 2. Get home directory
    let home_dir = dirs::home_dir()?;

    // 3. Try each location in priority order
    for location in CLAUDE_DATA_LOCATIONS {
        let path = home_dir.join(location);
        if path.exists() && path.is_dir() {
            let projects_dir = path.join("projects");
            if projects_dir.exists() && projects_dir.is_dir() {
                return Some(path);
            }
        }
    }

    // 4. Check XDG env vars (user may have non-standard XDG base dirs)
    if let Ok(xdg_config) = env::var("XDG_CONFIG_HOME") {
        for name in &["claude-code", "claude"] {
            let path = PathBuf::from(&xdg_config).join(name);
            if path.is_dir() && path.join("projects").is_dir() {
                return Some(path);
            }
        }
    }
    if let Ok(xdg_data) = env::var("XDG_DATA_HOME") {
        for name in &["claude-code", "claude"] {
            let path = PathBuf::from(&xdg_data).join(name);
            if path.is_dir() && path.join("projects").is_dir() {
                return Some(path);
            }
        }
    }

    // 5. Check for npx-specific patterns (these have hash in path)
    let npm_dir = home_dir.join(".npm");
    if npm_dir.exists() {
        if let Ok(entries) = fs::read_dir(&npm_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("_npx"))
                    .unwrap_or(false)
                {
                    let claude_path = path
                        .join("node_modules")
                        .join("@anthropic-ai")
                        .join("claude-code")
                        .join(".claude");
                    if claude_path.exists() {
                        let projects_dir = claude_path.join("projects");
                        if projects_dir.exists() {
                            return Some(claude_path);
                        }
                    }
                }
            }
        }
    }

    // 6. Broad fallback: scan $HOME top-level dotdirs (depth 2) for a valid claude data dir
    //    Looks for any directory containing a "projects" subdir with UUID-named session folders
    if let Ok(entries) = fs::read_dir(&home_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            // Only scan dotdirs that contain "claude" in the name
            if !name.starts_with('.') || !name.to_lowercase().contains("claude") {
                continue;
            }
            if let Some(found) = check_claude_data_dir(&path) {
                return Some(found);
            }
        }
    }

    // 7. Scan ~/.config and ~/.local/share one level deep for claude-related dirs
    for parent in &[home_dir.join(".config"), home_dir.join(".local").join("share")] {
        if let Ok(entries) = fs::read_dir(parent) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let name = match path.file_name().and_then(|n| n.to_str()) {
                    Some(n) => n.to_lowercase(),
                    None => continue,
                };
                if name.contains("claude") {
                    if let Some(found) = check_claude_data_dir(&path) {
                        return Some(found);
                    }
                }
            }
        }
    }

    None
}

/// Check if a directory is a valid Claude data dir (contains projects/ with session-like subdirs)
fn check_claude_data_dir(path: &PathBuf) -> Option<PathBuf> {
    let projects = path.join("projects");
    if !projects.is_dir() {
        return None;
    }
    // Verify it has at least one subdirectory (encoded project path)
    if let Ok(mut entries) = fs::read_dir(&projects) {
        if entries.any(|e| e.map(|e| e.path().is_dir()).unwrap_or(false)) {
            return Some(path.clone());
        }
    }
    None
}

/// Get all possible Claude data paths for debugging
#[tauri::command]
pub fn get_claude_data_paths() -> Result<Vec<String>, String> {
    let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;

    let mut paths = Vec::new();

    // Add env var path if set
    if let Ok(env_path) = env::var(CLAUDE_DATA_ENV) {
        paths.push(format!("ENV[{}]: {}", CLAUDE_DATA_ENV, env_path));
    }

    // Add all standard locations
    for location in CLAUDE_DATA_LOCATIONS {
        let full_path = home_dir.join(location);
        let exists = full_path.exists();
        let has_projects = full_path.join("projects").exists();
        paths.push(format!(
            "{}{}{}",
            full_path.to_string_lossy(),
            if exists { " [EXISTS]" } else { "" },
            if has_projects { " [VALID]" } else { "" }
        ));
    }

    // Add npx patterns
    let npm_dir = home_dir.join(".npm");
    if npm_dir.exists() {
        if let Ok(entries) = fs::read_dir(&npm_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("_npx"))
                    .unwrap_or(false)
                {
                    let claude_path = path
                        .join("node_modules")
                        .join("@anthropic-ai")
                        .join("claude-code")
                        .join(".claude");
                    let exists = claude_path.exists();
                    let has_projects = claude_path.join("projects").exists();
                    paths.push(format!(
                        "{}{}{}",
                        claude_path.to_string_lossy(),
                        if exists { " [EXISTS]" } else { "" },
                        if has_projects { " [VALID]" } else { "" }
                    ));
                }
            }
        }
    }

    // Show what discover_claude_data_dir actually resolved to
    match find_claude_data_dir() {
        Some(p) => paths.push(format!("RESOLVED: {} [ACTIVE]", p.to_string_lossy())),
        None => paths.push("RESOLVED: <none>".to_string()),
    }

    Ok(paths)
}

/// Get the Claude Code sessions index for a project (paginated)
#[tauri::command]
pub fn get_claude_sessions(
    project_path: String,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<ClaudeSessionsPage, String> {
    let limit = limit.unwrap_or(20);
    let offset = offset.unwrap_or(0);

    // Encode the project path
    let encoded_path = encode_project_path(&project_path);

    // Find Claude data directory
    let claude_dir = find_claude_data_dir().ok_or_else(|| {
        let msg = format!(
            "Could not find Claude Code data directory.\n\n\
                Tried locations:\n{}\n\n\
                Set {} environment variable to override.",
            CLAUDE_DATA_LOCATIONS.join("\n"),
            CLAUDE_DATA_ENV
        );
        msg
    })?;

    let sessions_file = claude_dir
        .join("projects")
        .join(&encoded_path)
        .join("sessions-index.json");

    let mut sessions = Vec::new();

    if sessions_file.exists() {
        let content = fs::read_to_string(&sessions_file).map_err(|e| {
            let msg = format!(
                "Failed to read sessions index from {:?}: {}",
                sessions_file, e
            );
            msg
        })?;

        let index: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
            let msg = format!("Failed to parse sessions index: {}", e);
            msg
        })?;

        if let Some(entries) = index.get("entries").and_then(|e| e.as_array()) {
            for entry in entries {
                let session = ClaudeSessionEntry {
                    session_id: entry
                        .get("sessionId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    full_path: entry
                        .get("fullPath")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    first_prompt: entry
                        .get("firstPrompt")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    summary: entry
                        .get("summary")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    message_count: entry
                        .get("messageCount")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32,
                    created: entry
                        .get("created")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    modified: entry
                        .get("modified")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    git_branch: entry
                        .get("gitBranch")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    project_path: entry
                        .get("projectPath")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    is_sidechain: entry
                        .get("isSidechain")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                };
                sessions.push(session);
            }
        }
    }

    // Also scan for .jsonl files not in the index
    let project_dir = claude_dir.join("projects").join(&encoded_path);
    let indexed_ids: std::collections::HashSet<String> =
        sessions.iter().map(|s| s.session_id.clone()).collect();

    if let Ok(entries) = fs::read_dir(&project_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if ext == "jsonl" {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        let sid = stem.to_string();
                        if !indexed_ids.contains(&sid) {
                            // Build a minimal entry from the file
                            if let Ok(entry) =
                                build_session_entry_from_file(&path, &sid, &project_path)
                            {
                                sessions.push(entry);
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by modified date (most recent first)
    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));

    let total = sessions.len();

    // Apply pagination
    let paginated: Vec<ClaudeSessionEntry> =
        sessions.into_iter().skip(offset).take(limit).collect();

    let has_more = offset + paginated.len() < total;

    Ok(ClaudeSessionsPage {
        sessions: paginated,
        total,
        has_more,
    })
}

/// Format unix milliseconds as ISO 8601 string (simplified)
fn format_unix_ms_as_iso(ms: u64) -> String {
    let secs = ms / 1000;
    let millis = ms % 1000;
    // Calculate date/time from unix timestamp
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    // Calculate year/month/day from days since epoch (1970-01-01)
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

/// Build a ClaudeSessionEntry by reading the first few lines of a .jsonl file
fn build_session_entry_from_file(
    path: &std::path::Path,
    session_id: &str,
    project_path: &str,
) -> Result<ClaudeSessionEntry, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| format_unix_ms_as_iso(d.as_millis() as u64))
        .unwrap_or_default();
    let created = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| format_unix_ms_as_iso(d.as_millis() as u64))
        .unwrap_or_else(|| modified.clone());

    // Read file to extract first prompt, summary, and message count
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut first_prompt = String::new();
    let mut message_count: i32 = 0;
    let mut summary = String::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
            if let Some(msg_type) = json.get("type").and_then(|v| v.as_str()) {
                match msg_type {
                    "user" | "assistant" => {
                        message_count += 1;
                        if first_prompt.is_empty() && msg_type == "user" {
                            if let Some(msg) = json.get("message") {
                                first_prompt = msg
                                    .get("content")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .chars()
                                    .take(200)
                                    .collect();
                            }
                        }
                    }
                    "summary" => {
                        summary = json
                            .get("summary")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(ClaudeSessionEntry {
        session_id: session_id.to_string(),
        full_path: path.to_string_lossy().to_string(),
        first_prompt,
        summary,
        message_count,
        created,
        modified,
        git_branch: None,
        project_path: project_path.to_string(),
        is_sidechain: false,
    })
}

/// Get a specific Claude Code session with its messages
#[tauri::command]
pub fn get_claude_session(
    session_id: String,
    project_path: String,
) -> Result<ClaudeSession, String> {
    // Encode the project path
    let encoded_path = encode_project_path(&project_path);

    // Find Claude data directory
    let claude_dir = find_claude_data_dir().ok_or("Could not find Claude Code data directory")?;

    let session_file = claude_dir
        .join("projects")
        .join(&encoded_path)
        .join(format!("{}.jsonl", session_id));

    if !session_file.exists() {
        return Err(format!("Session file not found: {:?}", session_file));
    }

    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(&session_file).map_err(|e| {
        format!("Failed to open session file: {}", e)
    })?;
    let reader = BufReader::new(file);

    let mut messages = Vec::new();
    let mut summary = None;


    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.trim().is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
            // Check the type field - Claude uses "user" and "assistant" types
            if let Some(msg_type) = json.get("type").and_then(|v| v.as_str()) {
                match msg_type {
                    "user" => {
                        if let Some(message) = json.get("message") {
                            let role = message
                                .get("role")
                                .and_then(|v| v.as_str())
                                .unwrap_or("user")
                                .to_string();

                            let content = message
                                .get("content")
                                .and_then(|v| v.as_str())
                                .unwrap_or_default()
                                .to_string();

                            let timestamp = json
                                .get("timestamp")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());

                            messages.push(ClaudeMessage {
                                role,
                                content,
                                timestamp,
                            });
                        }
                    }
                    "assistant" => {
                        if let Some(message) = json.get("message") {
                            let role = message
                                .get("role")
                                .and_then(|v| v.as_str())
                                .unwrap_or("assistant")
                                .to_string();

                            // Assistant content is an array of blocks
                            let content_blocks = message.get("content").and_then(|v| v.as_array());

                            // Filter out thinking blocks, keep only text blocks
                            let content = if let Some(blocks) = content_blocks {
                                let texts: Vec<String> = blocks
                                    .iter()
                                    .filter_map(|block| {
                                        // Only include text blocks, skip thinking blocks
                                        block
                                            .get("text")
                                            .and_then(|t| t.as_str())
                                            .map(|s| s.to_string())
                                    })
                                    .collect();
                                if texts.is_empty() {
                                    // Skip assistant messages with only thinking blocks
                                    continue;
                                }
                                texts.join("\n\n")
                            } else {
                                message
                                    .get("content")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or_default()
                                    .to_string()
                            };

                            let timestamp = json
                                .get("timestamp")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());

                            messages.push(ClaudeMessage {
                                role,
                                content,
                                timestamp,
                            });
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(ClaudeSession {
        session_id,
        messages,
        summary,
        project_path,
    })
}

/// Get the most recent active session for a project
#[tauri::command]
pub fn get_active_claude_session(
    project_path: String,
) -> Result<Option<ClaudeSessionEntry>, String> {
    let page = get_claude_sessions(project_path, Some(1), Some(0))?;

    // Return the first (most recent) non-sidechain session
    Ok(page.sessions.into_iter().filter(|s| !s.is_sidechain).next())
}

/// Get all Claude Code instances (projects with sessions)
#[tauri::command]
pub fn get_claude_instances() -> Result<Vec<crate::instance_sync::types::InstanceState>, String> {
    use crate::instance_sync::types::{InstanceState, InstanceStatus};

    let claude_dir = find_claude_data_dir();
    if claude_dir.is_none() {
        return Ok(Vec::new());
    }
    let claude_dir = claude_dir.unwrap();

    let projects_dir = claude_dir.join("projects");
    if !projects_dir.exists() {
        return Ok(Vec::new());
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut instances = Vec::new();

    // Scan all project directories
    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Decode the project path from directory name
                if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                    let project_path = decode_project_path(dir_name);

                    // Check if this project has sessions
                    let sessions_index = path.join("sessions-index.json");
                    if sessions_index.exists() {
                        let project_name = PathBuf::from(&project_path)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Unknown")
                            .to_string();

                        // Check if sessions file has recent activity by reading modification time
                        let last_updated = if let Ok(metadata) = fs::metadata(&sessions_index) {
                            if let Ok(modified) = metadata.modified() {
                                modified
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_secs()
                            } else {
                                now
                            }
                        } else {
                            now
                        };

                        // Only include if has recent activity (< 1 hour)
                        let age = now - last_updated;
                        if age < 3600 {
                            instances.push(InstanceState {
                                instance_id: format!("claude-{}", dir_name),
                                project_path: project_path.clone(),
                                project_name,
                                current_focus: String::new(),
                                active_files: Vec::new(),
                                claude_session_id: None,
                                opencode_session_id: None,
                                source: "claude".to_string(),
                                last_updated,
                                status: InstanceStatus::Active,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(instances)
}

/// Decode a project path from Claude directory name
/// Claude replaces ALL / with - (including leading /)
/// So -home-enrique-projects-nevo-terminal becomes /home/enrique/projects/nevo-terminal
fn decode_project_path(encoded: &str) -> String {
    encoded.replace('-', "/")
}

/// Encode a project path for the Claude directory structure
/// Claude replaces ALL / with - (including leading /)
/// So /home/enrique/projects/nevo-terminal becomes -home-enrique-projects-nevo-terminal
fn encode_project_path(path: &str) -> String {
    path.replace('/', "-").replace(' ', "-")
}

/// Store for the subagent filesystem watcher
pub struct SubagentWatcherStore {
    active: std::sync::Arc<std::sync::Mutex<Option<SubagentWatcherHandle>>>,
}

struct SubagentWatcherHandle {
    _stop_tx: std::sync::mpsc::Sender<()>,
}

impl SubagentWatcherStore {
    pub fn new() -> Self {
        Self {
            active: std::sync::Arc::new(std::sync::Mutex::new(None)),
        }
    }
}

/// Get subagents for a given session
#[tauri::command]
pub fn get_session_subagents(
    session_id: String,
    project_path: String,
) -> Result<Vec<SubagentInfo>, String> {
    use std::io::{BufRead, BufReader};

    let encoded_path = encode_project_path(&project_path);
    let claude_dir = find_claude_data_dir().ok_or("Could not find Claude Code data directory")?;

    let subagents_dir = claude_dir
        .join("projects")
        .join(&encoded_path)
        .join(&session_id)
        .join("subagents");

    if !subagents_dir.exists() || !subagents_dir.is_dir() {
        return Ok(Vec::new());
    }

    let now = std::time::SystemTime::now();
    let mut subagents = Vec::new();

    let entries = fs::read_dir(&subagents_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        if !name.starts_with("agent-") || !name.ends_with(".jsonl") {
            continue;
        }

        let file = match std::fs::File::open(&path) {
            Ok(f) => f,
            Err(_) => continue,
        };

        let metadata = match file.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Determine status based on mtime
        let mtime_age = now
            .duration_since(metadata.modified().unwrap_or(now))
            .unwrap_or_default();
        let status = if mtime_age.as_secs() < 30 {
            SubagentStatus::Running
        } else {
            SubagentStatus::Completed
        };

        let mut reader = BufReader::new(&file);

        // Parse first line for agent_id, slug, description, started_at
        let mut first_line = String::new();
        if reader.read_line(&mut first_line).unwrap_or(0) == 0 {
            continue;
        }

        let first_json: serde_json::Value = match serde_json::from_str(first_line.trim()) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let agent_id = first_json
            .get("agentId")
            .or_else(|| first_json.get("agent_id"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let slug = first_json
            .get("slug")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let started_at = first_json
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Extract description from first user message content
        let description = first_json
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|c| {
                if let Some(s) = c.as_str() {
                    Some(s.chars().take(500).collect::<String>())
                } else if let Some(arr) = c.as_array() {
                    arr.iter()
                        .find_map(|block| block.get("text").and_then(|t| t.as_str()))
                        .map(|s| s.chars().take(500).collect::<String>())
                } else {
                    None
                }
            })
            .unwrap_or_default();

        // Scan file for message_count, last_tool, last_activity
        let mut message_count: u32 = 1; // count first line
        let mut last_tool: Option<String> = None;
        let mut last_activity = started_at.clone();

        // Read remaining lines
        for line_result in reader.lines() {
            let line = match line_result {
                Ok(l) => l,
                Err(_) => continue,
            };
            if line.trim().is_empty() {
                continue;
            }

            message_count += 1;

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(ts) = json.get("timestamp").and_then(|v| v.as_str()) {
                    last_activity = ts.to_string();
                }

                // Check for tool_use in assistant message content blocks
                if let Some(message) = json.get("message") {
                    if let Some(blocks) = message.get("content").and_then(|c| c.as_array()) {
                        for block in blocks {
                            if block.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                                if let Some(tool_name) =
                                    block.get("name").and_then(|n| n.as_str())
                                {
                                    last_tool = Some(tool_name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        subagents.push(SubagentInfo {
            agent_id,
            slug,
            status,
            description,
            last_tool,
            message_count,
            started_at: started_at.clone(),
            last_activity,
        });
    }

    // Sort by started_at descending (most recent first)
    subagents.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    Ok(subagents)
}

/// Get all subagents across all sessions for a project (scans all session dirs)
#[tauri::command]
pub fn get_project_subagents(
    project_path: String,
) -> Result<Vec<SubagentInfo>, String> {
    let encoded_path = encode_project_path(&project_path);
    let claude_dir = find_claude_data_dir().ok_or("Could not find Claude Code data directory")?;

    let project_dir = claude_dir.join("projects").join(&encoded_path);
    if !project_dir.exists() {
        return Ok(Vec::new());
    }

    let mut all_subagents = Vec::new();

    // Scan all session directories for subagents
    let entries = fs::read_dir(&project_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let subagents_dir = path.join("subagents");
        if !subagents_dir.is_dir() {
            continue;
        }

        // Get session_id from directory name
        let session_id = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        match get_session_subagents(session_id, project_path.clone()) {
            Ok(mut subs) => all_subagents.append(&mut subs),
            Err(_) => continue,
        }
    }

    // Sort by started_at descending
    all_subagents.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    Ok(all_subagents)
}

/// Start watching a project's subagent directories for changes
#[tauri::command]
pub fn watch_project_subagents(
    project_path: String,
    app_handle: tauri::AppHandle,
    store: tauri::State<std::sync::Arc<SubagentWatcherStore>>,
) -> Result<(), String> {
    use notify::{RecommendedWatcher, RecursiveMode, Watcher};
    use tauri::Emitter;

    let encoded_path = encode_project_path(&project_path);
    let claude_dir = find_claude_data_dir().ok_or("Could not find Claude Code data directory")?;

    let project_dir = claude_dir.join("projects").join(&encoded_path);
    if !project_dir.exists() {
        return Err("Project directory not found".to_string());
    }

    let mut active = store.active.lock().map_err(|e| format!("Lock error: {}", e))?;

    // Stop existing watcher
    active.take();

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    let (event_tx, event_rx) = std::sync::mpsc::channel::<()>();

    let mut watcher: RecommendedWatcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(event) = res {
            // Only emit for subagent file changes
            let is_subagent = event.paths.iter().any(|p| {
                p.to_string_lossy().contains("/subagents/")
            });
            if is_subagent {
                let _ = event_tx.send(());
            }
        }
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Watch the entire project dir recursively to catch new session dirs + subagent files
    watcher
        .watch(&project_dir, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch project dir: {}", e))?;

    // Debounce thread
    std::thread::spawn(move || {
        let _watcher = watcher; // keep alive
        let debounce = std::time::Duration::from_millis(500);

        loop {
            match stop_rx.try_recv() {
                Ok(()) | Err(std::sync::mpsc::TryRecvError::Disconnected) => break,
                Err(std::sync::mpsc::TryRecvError::Empty) => {}
            }

            match event_rx.recv_timeout(std::time::Duration::from_millis(200)) {
                Ok(()) => {
                    // Drain further events within debounce window
                    while event_rx.recv_timeout(debounce).is_ok() {}
                    let _ = app_handle.emit("subagents-changed", ());
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    *active = Some(SubagentWatcherHandle {
        _stop_tx: stop_tx,
    });

    Ok(())
}

/// Stop the subagent filesystem watcher
#[tauri::command]
pub fn stop_session_subagents_watcher(
    store: tauri::State<std::sync::Arc<SubagentWatcherStore>>,
) -> Result<(), String> {
    let mut active = store.active.lock().map_err(|e| format!("Lock error: {}", e))?;
    active.take();
    Ok(())
}
