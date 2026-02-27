use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSessionEntry {
    pub session_id: String,
    pub full_path: String,
    pub first_prompt: String,
    pub summary: String,
    pub message_count: i32,
    pub created: String,
    pub modified: String,
    pub git_branch: Option<String>,
    pub project_path: String,
    pub is_sidechain: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSessionsIndex {
    pub version: i32,
    pub entries: Vec<ClaudeSessionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSessionsPage {
    pub sessions: Vec<ClaudeSessionEntry>,
    pub total: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMessage {
    pub role: String,
    pub content: String,
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSession {
    pub session_id: String,
    pub messages: Vec<ClaudeMessage>,
    pub summary: Option<String>,
    pub project_path: String,
}
