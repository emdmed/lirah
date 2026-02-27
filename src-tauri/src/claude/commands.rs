use crate::claude::types::{ClaudeMessage, ClaudeSession, ClaudeSessionEntry, ClaudeSessionsPage};
use std::env;
use std::fs;
use std::path::PathBuf;

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
fn find_claude_data_dir() -> Option<PathBuf> {
    // 1. Check environment variable override first
    if let Ok(env_path) = env::var(CLAUDE_DATA_ENV) {
        let path = PathBuf::from(env_path);
        eprintln!("[Claude Discovery] Trying env var: {:?}", path);
        if path.exists() {
            eprintln!("[Claude Discovery] ✓ Found via CLAUDE_CODE_DATA_DIR");
            return Some(path);
        }
        eprintln!("[Claude Discovery] ✗ Env var path doesn't exist");
    }

    // 2. Get home directory
    let home_dir = dirs::home_dir()?;
    eprintln!("[Claude Discovery] Home directory: {:?}", home_dir);

    // 2.5 Check if ~/.claude exists specifically (debugging Ubuntu issue)
    let standard_claude = home_dir.join(".claude");
    eprintln!(
        "[Claude Discovery] Checking ~/.claude specifically: {:?}",
        standard_claude
    );
    if standard_claude.exists() {
        eprintln!("[Claude Discovery] ✓ ~/.claude EXISTS");
        let projects = standard_claude.join("projects");
        if projects.exists() {
            eprintln!("[Claude Discovery] ✓ ~/.claude/projects EXISTS");
            // Try to read it
            match fs::read_dir(&projects) {
                Ok(entries) => {
                    let count = entries.count();
                    eprintln!(
                        "[Claude Discovery] ✓ Can read ~/.claude/projects, found {} entries",
                        count
                    );
                }
                Err(e) => {
                    eprintln!("[Claude Discovery] ✗ Cannot read ~/.claude/projects: {}", e);
                }
            }
        } else {
            eprintln!("[Claude Discovery] ✗ ~/.claude/projects NOT FOUND");
        }
    } else {
        eprintln!("[Claude Discovery] ✗ ~/.claude NOT FOUND");
    }

    // 3. Try each location in priority order
    for location in CLAUDE_DATA_LOCATIONS {
        let path = home_dir.join(location);
        eprintln!("[Claude Discovery] Trying: {:?}", path);

        if path.exists() && path.is_dir() {
            // Verify it has a "projects" subdirectory (confirm it's a Claude data dir)
            let projects_dir = path.join("projects");
            if projects_dir.exists() && projects_dir.is_dir() {
                eprintln!(
                    "[Claude Discovery] ✓ Found valid Claude data directory: {:?}",
                    path
                );
                return Some(path);
            }
            eprintln!(
                "[Claude Discovery] ~ Directory exists but no 'projects' subdir: {:?}",
                path
            );
        }
    }

    // 4. Check for npx-specific patterns (these have hash in path)
    eprintln!("[Claude Discovery] Checking npx-specific locations...");
    let npm_dir = home_dir.join(".npm");
    if npm_dir.exists() {
        // Look for _npx directories
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
                    eprintln!("[Claude Discovery] Trying npx path: {:?}", claude_path);
                    if claude_path.exists() {
                        let projects_dir = claude_path.join("projects");
                        if projects_dir.exists() {
                            eprintln!(
                                "[Claude Discovery] ✓ Found npx Claude directory: {:?}",
                                claude_path
                            );
                            return Some(claude_path);
                        }
                    }
                }
            }
        }
    }

    eprintln!("[Claude Discovery] ✗ No Claude data directory found");
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

    eprintln!(
        "\n[Claude Sessions] Requesting sessions for: {} (limit={}, offset={})",
        project_path, limit, offset
    );

    // Encode the project path
    let encoded_path = encode_project_path(&project_path);
    eprintln!("[Claude Sessions] Encoded path: {}", encoded_path);

    // Find Claude data directory
    let claude_dir = find_claude_data_dir().ok_or_else(|| {
        let msg = format!(
            "Could not find Claude Code data directory.\n\n\
                Tried locations:\n{}\n\n\
                Set {} environment variable to override.",
            CLAUDE_DATA_LOCATIONS.join("\n"),
            CLAUDE_DATA_ENV
        );
        eprintln!("[Claude Sessions] ERROR: {}", msg);
        msg
    })?;

    let sessions_file = claude_dir
        .join("projects")
        .join(&encoded_path)
        .join("sessions-index.json");
    eprintln!("[Claude Sessions] Looking for: {:?}", sessions_file);

    if !sessions_file.exists() {
        eprintln!(
            "[Claude Sessions] Sessions file not found at: {:?}",
            sessions_file
        );
        return Ok(ClaudeSessionsPage {
            sessions: Vec::new(),
            total: 0,
            has_more: false,
        });
    }

    let content = fs::read_to_string(&sessions_file).map_err(|e| {
        let msg = format!(
            "Failed to read sessions index from {:?}: {}",
            sessions_file, e
        );
        eprintln!("[Claude Sessions] ERROR: {}", msg);
        msg
    })?;

    let index: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
        let msg = format!("Failed to parse sessions index: {}", e);
        eprintln!("[Claude Sessions] ERROR: {}", msg);
        msg
    })?;

    let mut sessions = Vec::new();

    if let Some(entries) = index.get("entries").and_then(|e| e.as_array()) {
        eprintln!(
            "[Claude Sessions] Found {} sessions in index",
            entries.len()
        );
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
    } else {
        eprintln!("[Claude Sessions] No entries found in sessions index");
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

    eprintln!(
        "[Claude Sessions] Returning {} of {} sessions (offset={}, limit={}, has_more={})",
        paginated.len(),
        total,
        offset,
        limit,
        has_more
    );

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
    eprintln!(
        "\n[Claude Session] Requesting session: {} for project: {}",
        session_id, project_path
    );

    // Encode the project path
    let encoded_path = encode_project_path(&project_path);

    // Find Claude data directory
    let claude_dir = find_claude_data_dir().ok_or("Could not find Claude Code data directory")?;

    let session_file = claude_dir
        .join("projects")
        .join(&encoded_path)
        .join(format!("{}.jsonl", session_id));

    eprintln!("[Claude Session] Looking for: {:?}", session_file);

    if !session_file.exists() {
        let msg = format!("Session file not found: {:?}", session_file);
        eprintln!("[Claude Session] ERROR: {}", msg);
        return Err(msg);
    }

    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(&session_file).map_err(|e| {
        let msg = format!("Failed to open session file: {}", e);
        eprintln!("[Claude Session] ERROR: {}", msg);
        msg
    })?;
    let reader = BufReader::new(file);

    let mut messages = Vec::new();
    let mut summary = None;
    let mut line_count = 0;

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        line_count += 1;
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

    eprintln!(
        "[Claude Session] Parsed {} lines, extracted {} messages",
        line_count,
        messages.len()
    );

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

/// Encode a project path for the Claude directory structure
/// Claude replaces ALL / with - (including leading /)
/// So /home/enrique/projects/nevo-terminal becomes -home-enrique-projects-nevo-terminal
fn encode_project_path(path: &str) -> String {
    path.replace('/', "-").replace(' ', "-")
}
