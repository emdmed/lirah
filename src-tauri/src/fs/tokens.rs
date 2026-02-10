use std::fs;
use std::path::PathBuf;
use std::io::{BufRead, BufReader};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Default)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub billable_input_tokens: u64,
    pub billable_output_tokens: u64,
    pub session_file: Option<String>,
}

#[derive(Deserialize)]
struct ClaudeMessage {
    message: Option<MessageContent>,
}

#[derive(Deserialize)]
struct MessageContent {
    id: Option<String>,
    usage: Option<UsageData>,
}

#[derive(Deserialize)]
struct UsageData {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
}

#[tauri::command]
pub fn get_session_token_usage(project_path: String) -> Result<TokenUsage, String> {
    // Convert project path to Claude's format: /home/user/projects/foo -> -home-user-projects-foo
    // Claude Code replaces both "/" and "." with "-"
    let claude_path_segment = project_path
        .replace("\\", "-")
        .replace("/", "-")
        .replace(".", "-");

    // Build path to Claude sessions directory
    let home = super::home_dir().ok_or("Could not get home directory")?;
    let sessions_dir = PathBuf::from(&home)
        .join(".claude")
        .join("projects")
        .join(&claude_path_segment);

    if !sessions_dir.exists() {
        return Ok(TokenUsage::default());
    }

    // Find the most recently modified .jsonl file
    let mut newest_file: Option<(PathBuf, std::time::SystemTime)> = None;

    let entries = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "jsonl") {
            if let Ok(metadata) = path.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if newest_file.as_ref().map_or(true, |(_, t)| modified > *t) {
                        newest_file = Some((path, modified));
                    }
                }
            }
        }
    }

    let session_file = match newest_file {
        Some((path, _)) => path,
        None => return Ok(TokenUsage::default()),
    };

    // Parse the JSONL file and sum up token usage
    let file = fs::File::open(&session_file)
        .map_err(|e| format!("Failed to open session file: {}", e))?;
    let reader = BufReader::new(file);

    // Use HashMap to deduplicate by message ID (streaming sends multiple updates per message)
    let mut usage_by_msg: HashMap<String, UsageData> = HashMap::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        // Parse each line as JSON
        if let Ok(msg) = serde_json::from_str::<ClaudeMessage>(&line) {
            if let Some(message) = msg.message {
                if let (Some(id), Some(u)) = (message.id, message.usage) {
                    // Always keep the latest usage for each message ID
                    usage_by_msg.insert(id, u);
                }
            }
        }
    }

    // Sum up the final usage from each unique message
    let mut usage = TokenUsage {
        session_file: Some(session_file.to_string_lossy().to_string()),
        ..Default::default()
    };

    for u in usage_by_msg.values() {
        let input = u.input_tokens.unwrap_or(0);
        let output = u.output_tokens.unwrap_or(0);
        let cache_read = u.cache_read_input_tokens.unwrap_or(0);
        let cache_creation = u.cache_creation_input_tokens.unwrap_or(0);

        usage.input_tokens += input;
        usage.output_tokens += output;
        usage.cache_read_input_tokens += cache_read;
        usage.cache_creation_input_tokens += cache_creation;

        // Billable: input + cache_creation (cache reads are discounted)
        usage.billable_input_tokens += input + cache_creation;
        usage.billable_output_tokens += output;
    }

    Ok(usage)
}
