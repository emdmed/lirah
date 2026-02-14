use std::fs;
use std::path::PathBuf;
use std::io::{BufRead, BufReader};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Default, Clone)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub billable_input_tokens: u64,
    pub billable_output_tokens: u64,
    pub model: Option<String>,
    pub session_file: Option<String>,
}

#[derive(Serialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub session_file: String,
    pub model: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub billable_input_tokens: u64,
    pub billable_output_tokens: u64,
    pub message_count: u64,
    pub timestamp: String,
}

#[derive(Deserialize)]
struct ClaudeMessage {
    message: Option<MessageContent>,
    timestamp: Option<String>,
    session_id: Option<String>,
}

#[derive(Deserialize)]
struct MessageContent {
    id: Option<String>,
    model: Option<String>,
    usage: Option<UsageData>,
}

#[derive(Deserialize, Default)]
struct UsageData {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
}

#[derive(Serialize, Default)]
pub struct ProjectStats {
    pub sessions: Vec<SessionInfo>,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub total_cache_creation_tokens: u64,
    pub total_billable_input_tokens: u64,
    pub total_billable_output_tokens: u64,
    pub models: Vec<String>,
    pub daily_activity: Vec<DailyActivity>,
}

#[derive(Serialize, Default)]
pub struct DailyActivity {
    pub date: String,
    pub model: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub billable_input_tokens: u64,
    pub billable_output_tokens: u64,
    pub message_count: u64,
    pub cost: f64,
}

fn parse_timestamp(ts: &str) -> Option<String> {
    if ts.len() >= 10 {
        Some(ts[..10].to_string())
    } else {
        None
    }
}

#[tauri::command]
pub fn get_session_token_usage(project_path: String) -> Result<TokenUsage, String> {
    let claude_path_segment = project_path
        .replace("\\", "-")
        .replace("/", "-")
        .replace(".", "-");

    let home = super::home_dir().ok_or("Could not get home directory")?;
    let sessions_dir = PathBuf::from(&home)
        .join(".claude")
        .join("projects")
        .join(&claude_path_segment);

    if !sessions_dir.exists() {
        return Ok(TokenUsage::default());
    }

    // Find only the most recently modified .jsonl file
    let latest = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?
        .flatten()
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "jsonl"))
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH));

    match latest {
        Some(entry) => {
            let session = parse_session_file(&entry.path())?;
            Ok(TokenUsage {
                input_tokens: session.input_tokens,
                output_tokens: session.output_tokens,
                cache_read_input_tokens: session.cache_read_input_tokens,
                cache_creation_input_tokens: session.cache_creation_input_tokens,
                billable_input_tokens: session.billable_input_tokens,
                billable_output_tokens: session.billable_output_tokens,
                model: session.model,
                session_file: Some(session.session_file),
            })
        }
        None => Ok(TokenUsage::default()),
    }
}

#[tauri::command]
pub fn get_project_stats(project_path: String) -> Result<ProjectStats, String> {
    get_project_stats_internal(&project_path)
}

fn get_project_stats_internal(project_path: &str) -> Result<ProjectStats, String> {
    let claude_path_segment = project_path
        .replace("\\", "-")
        .replace("/", "-")
        .replace(".", "-");

    let home = super::home_dir().ok_or("Could not get home directory")?;
    let sessions_dir = PathBuf::from(&home)
        .join(".claude")
        .join("projects")
        .join(&claude_path_segment);

    if !sessions_dir.exists() {
        return Ok(ProjectStats::default());
    }

    let entries = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    let mut sessions: Vec<SessionInfo> = Vec::new();
    let mut model_usage: HashMap<String, DailyActivity> = HashMap::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "jsonl") {
            if let Ok(session_info) = parse_session_file(&path) {
                let model = session_info.model.clone();
                let timestamp = session_info.timestamp.clone();
                
                if !timestamp.is_empty() {
                    if let Some(date) = parse_timestamp(&timestamp) {
                        let key = format!("{}:{}", model.as_deref().unwrap_or("unknown"), date);
                        let entry = model_usage.entry(key).or_insert_with(|| DailyActivity {
                            date: date.clone(),
                            model: model.clone(),
                            ..Default::default()
                        });
                        entry.input_tokens += session_info.input_tokens;
                        entry.output_tokens += session_info.output_tokens;
                        entry.cache_read_input_tokens += session_info.cache_read_input_tokens;
                        entry.cache_creation_input_tokens += session_info.cache_creation_input_tokens;
                        entry.billable_input_tokens += session_info.billable_input_tokens;
                        entry.billable_output_tokens += session_info.billable_output_tokens;
                        entry.message_count += session_info.message_count;
                    }
                }
                
                sessions.push(session_info);
            }
        }
    }

    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    let total_input_tokens: u64 = sessions.iter().map(|s| s.input_tokens).sum();
    let total_output_tokens: u64 = sessions.iter().map(|s| s.output_tokens).sum();
    let total_cache_read_tokens: u64 = sessions.iter().map(|s| s.cache_read_input_tokens).sum();
    let total_cache_creation_tokens: u64 = sessions.iter().map(|s| s.cache_creation_input_tokens).sum();
    let total_billable_input_tokens: u64 = sessions.iter().map(|s| s.billable_input_tokens).sum();
    let total_billable_output_tokens: u64 = sessions.iter().map(|s| s.billable_output_tokens).sum();

    let mut models: Vec<String> = sessions
        .iter()
        .filter_map(|s| s.model.clone())
        .collect();
    models.sort();
    models.dedup();

    let daily_activity: Vec<DailyActivity> = model_usage.into_values().collect();
    let mut daily_activity = daily_activity;
    daily_activity.sort_by(|a, b| b.date.cmp(&a.date));

    for activity in &mut daily_activity {
        activity.cost = calculate_cost(activity.input_tokens, activity.output_tokens, activity.cache_read_input_tokens, activity.cache_creation_input_tokens, activity.model.as_deref().unwrap_or("claude-sonnet-4-5-20250929"));
    }

    Ok(ProjectStats {
        sessions,
        total_input_tokens,
        total_output_tokens,
        total_cache_read_tokens,
        total_cache_creation_tokens,
        total_billable_input_tokens,
        total_billable_output_tokens,
        models,
        daily_activity,
    })
}

fn calculate_cost(input_tokens: u64, output_tokens: u64, cache_read: u64, cache_creation: u64, model: &str) -> f64 {
    let (input_rate, output_rate, cache_read_rate, cache_write_rate) = if model.contains("opus") {
        (15.0, 75.0, 1.88, 18.75)
    } else {
        (3.0, 15.0, 0.375, 3.75)
    };

    let input_cost = (input_tokens as f64 / 1_000_000.0) * input_rate;
    let output_cost = (output_tokens as f64 / 1_000_000.0) * output_rate;
    let cache_read_cost = (cache_read as f64 / 1_000_000.0) * cache_read_rate;
    let cache_write_cost = (cache_creation as f64 / 1_000_000.0) * cache_write_rate;

    input_cost + output_cost + cache_read_cost + cache_write_cost
}

fn parse_session_file(path: &PathBuf) -> Result<SessionInfo, String> {
    let file = fs::File::open(path)
        .map_err(|e| format!("Failed to open session file: {}", e))?;
    let reader = BufReader::new(file);

    let mut usage_by_msg: HashMap<String, UsageData> = HashMap::new();
    let mut session_id = String::new();
    let mut model: Option<String> = None;
    let mut timestamp: Option<String> = None;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if let Ok(msg) = serde_json::from_str::<ClaudeMessage>(&line) {
            if session_id.is_empty() {
                session_id = msg.session_id.unwrap_or_default();
            }
            if timestamp.is_none() {
                timestamp = msg.timestamp;
            }
            if let Some(message) = msg.message {
                if model.is_none() {
                    model = message.model;
                }
                if let (Some(id), Some(u)) = (message.id, message.usage) {
                    usage_by_msg.insert(id, u);
                }
            }
        }
    }

    let mut input_tokens = 0u64;
    let mut output_tokens = 0u64;
    let mut cache_read = 0u64;
    let mut cache_creation = 0u64;

    for u in usage_by_msg.values() {
        input_tokens += u.input_tokens.unwrap_or(0);
        output_tokens += u.output_tokens.unwrap_or(0);
        cache_read += u.cache_read_input_tokens.unwrap_or(0);
        cache_creation += u.cache_creation_input_tokens.unwrap_or(0);
    }

    let billable_input_tokens = input_tokens + cache_creation;
    let billable_output_tokens = output_tokens;

    let message_count = usage_by_msg.len() as u64;

    Ok(SessionInfo {
        session_id,
        session_file: path.to_string_lossy().to_string(),
        model,
        input_tokens,
        output_tokens,
        cache_read_input_tokens: cache_read,
        cache_creation_input_tokens: cache_creation,
        billable_input_tokens,
        billable_output_tokens,
        message_count,
        timestamp: timestamp.unwrap_or_default(),
    })
}
