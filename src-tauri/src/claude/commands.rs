use crate::claude::types::{ClaudeMessage, ClaudeSession, ClaudeSessionEntry};
use std::fs;
use std::path::PathBuf;

/// Get the Claude Code sessions index for a project
#[tauri::command]
pub fn get_claude_sessions(project_path: String) -> Result<Vec<ClaudeSessionEntry>, String> {
    // Encode the project path for the Claude directory structure
    let encoded_path = encode_project_path(&project_path);
    let claude_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".claude")
        .join("projects")
        .join(encoded_path);

    let sessions_file = claude_dir.join("sessions-index.json");

    if !sessions_file.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&sessions_file)
        .map_err(|e| format!("Failed to read sessions index: {}", e))?;

    let index: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse sessions index: {}", e))?;

    let mut sessions = Vec::new();

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

    // Sort by modified date (most recent first)
    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));

    Ok(sessions)
}

/// Get a specific Claude Code session with its messages
#[tauri::command]
pub fn get_claude_session(
    session_id: String,
    project_path: String,
) -> Result<ClaudeSession, String> {
    // Encode the project path for the Claude directory structure
    let encoded_path = encode_project_path(&project_path);
    let claude_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".claude")
        .join("projects")
        .join(encoded_path);

    let session_file = claude_dir.join(format!("{}.jsonl", session_id));

    if !session_file.exists() {
        return Err(format!("Session file not found: {:?}", session_file));
    }

    let content = fs::read_to_string(&session_file)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let mut messages = Vec::new();
    let mut summary = None;

    for line in content.lines() {
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
