use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceState {
    pub instance_id: String,
    pub project_path: String,
    pub project_name: String,
    pub current_focus: String,
    pub active_files: Vec<String>,
    pub claude_session_id: Option<String>,
    pub opencode_session_id: Option<String>,
    pub source: String,
    pub last_updated: u64,
    pub status: InstanceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InstanceStatus {
    Active,
    Idle,
    Busy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceUpdate {
    pub project_path: Option<String>,
    pub current_focus: Option<String>,
    pub active_files: Option<Vec<String>>,
    pub claude_session_id: Option<Option<String>>,
    pub opencode_session_id: Option<Option<String>>,
    pub status: Option<InstanceStatus>,
}

impl InstanceState {
    pub fn new(instance_id: String, project_path: String) -> Self {
        let project_name = std::path::Path::new(&project_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();

        Self {
            instance_id,
            project_path,
            project_name,
            current_focus: String::new(),
            active_files: Vec::new(),
            claude_session_id: None,
            opencode_session_id: None,
            source: "lirah".to_string(),
            last_updated: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            status: InstanceStatus::Active,
        }
    }
}
