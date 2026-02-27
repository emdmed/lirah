use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeSessionEntry {
    pub session_id: String,
    pub full_path: String,
    pub first_prompt: String,
    pub summary: String,
    pub message_count: i32,
    pub created: String,
    pub modified: String,
    pub git_branch: Option<String>,
    pub project_path: String,
    pub is_fork: bool,
    pub title: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeSessionsPage {
    pub sessions: Vec<OpencodeSessionEntry>,
    pub total: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeMessage {
    pub role: String,
    pub content: String,
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeSession {
    pub session_id: String,
    pub messages: Vec<OpencodeMessage>,
    pub summary: Option<String>,
    pub project_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeProjectInfo {
    pub id: String,
    pub worktree: String,
    pub vcs: Option<String>,
    pub time: OpencodeProjectTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeProjectTime {
    pub created: u64,
    pub updated: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeSessionInfo {
    pub id: String,
    pub slug: String,
    pub version: String,
    pub project_id: String,
    pub directory: String,
    pub title: String,
    pub time: OpencodeSessionTime,
    pub summary: Option<OpencodeSessionSummary>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeSessionTime {
    pub created: u64,
    pub updated: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeSessionSummary {
    pub additions: i32,
    pub deletions: i32,
    pub files: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeMessageInfo {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub time: OpencodeMessageTime,
    pub parent_id: Option<String>,
    pub model: Option<OpencodeModelInfo>,
    pub agent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeMessageTime {
    pub created: u64,
    pub completed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodeModelInfo {
    pub provider_id: String,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodePartInfo {
    pub id: String,
    pub session_id: String,
    pub message_id: String,
    pub part_type: String,
    pub text: Option<String>,
    pub time: OpencodePartTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpencodePartTime {
    pub start: u64,
    pub end: u64,
}
