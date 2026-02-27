use crate::claude::types::{ClaudeMessage, ClaudeSession, ClaudeSessionEntry};
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

/// Get the Claude Code sessions index for a project
#[tauri::command]
pub fn get_claude_sessions(project_path: String) -> Result<Vec<ClaudeSessionEntry>, String> {
    eprintln!(
        "\n[Claude Sessions] Requesting sessions for: {}",
        project_path
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
        return Ok(Vec::new());
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

    // Sort by modified date (most recent first)
    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));
    eprintln!(
        "[Claude Sessions] Returning {} sessions (sorted newest first)",
        sessions.len()
    );

    Ok(sessions)
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

    let content = fs::read_to_string(&session_file).map_err(|e| {
        let msg = format!("Failed to read session file: {}", e);
        eprintln!("[Claude Session] ERROR: {}", msg);
        msg
    })?;

    let mut messages = Vec::new();
    let mut summary = None;
    let mut line_count = 0;

    for line in content.lines() {
        line_count += 1;
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
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
    let sessions = get_claude_sessions(project_path)?;

    // Return the first (most recent) non-sidechain session
    Ok(sessions.into_iter().filter(|s| !s.is_sidechain).next())
}

/// Encode a project path for the Claude directory structure
/// Claude replaces ALL / with - (including leading /)
/// So /home/enrique/projects/nevo-terminal becomes -home-enrique-projects-nevo-terminal
fn encode_project_path(path: &str) -> String {
    path.replace('/', "-").replace(' ', "-")
}
