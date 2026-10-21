use std::fs;
use std::path::PathBuf;
use std::io::BufRead;
use std::collections::HashMap;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use crate::state::AppState;
use super::transcript::is_jsonl;

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
    /// Context window occupancy of the most recent assistant turn:
    /// input + cache_read + cache_creation of that message's usage.
    #[serde(default)]
    pub context_tokens: u64,
    /// Model id of the most recent assistant turn (picks the context window).
    #[serde(default)]
    pub last_model: Option<String>,
    /// Claude session id the numbers belong to.
    #[serde(default)]
    pub session_id: Option<String>,
    /// True when the session was resolved from the tab's own `claude` process;
    /// false when we fell back to the project's most recently written session.
    #[serde(default)]
    pub tab_bound: bool,
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
    pub context_tokens: u64,
    pub last_model: Option<String>,
}

#[derive(Deserialize)]
struct ClaudeMessage {
    #[serde(rename = "type")]
    kind: Option<String>,
    message: Option<MessageContent>,
    timestamp: Option<String>,
    // Separate fields, not an alias: assistant lines carry both keys, and
    // serde rejects a line whose aliased field appears twice.
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "session_id")]
    session_id_snake: Option<String>,
}

#[derive(Deserialize)]
struct MessageContent {
    id: Option<String>,
    model: Option<String>,
    usage: Option<UsageData>,
}

#[derive(Deserialize, Default, Clone)]
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

/// Claude Code's directory name for a project: every character that is not
/// an ASCII letter or digit becomes '-'.
pub fn claude_project_dir_name(project_path: &str) -> String {
    project_path
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

fn claude_sessions_dir(project_path: &str) -> Option<PathBuf> {
    let home = crate::util::home_dir()?;
    Some(
        PathBuf::from(home)
            .join(".claude")
            .join("projects")
            .join(claude_project_dir_name(project_path)),
    )
}

/// Session currently open in a running `claude` process, as recorded by
/// Claude Code in ~/.claude/sessions/<pid>.json (updated on /clear, /resume).
/// `<pid>` is the pid as seen inside the process's own pid namespace.
#[derive(Deserialize)]
struct LiveClaudeSession {
    #[serde(rename = "sessionId")]
    session_id: String,
    cwd: String,
    /// Process start time (clock ticks since boot, /proc/<pid>/stat field 22).
    #[serde(rename = "procStart")]
    proc_start: Option<String>,
}

/// All descendants of `root` (breadth-first), via /proc/<pid>/task/<tid>/children.
#[cfg(target_os = "linux")]
fn descendant_pids(root: u32) -> Vec<u32> {
    let mut out = Vec::new();
    let mut queue = vec![root];
    while let Some(pid) = queue.pop() {
        let Ok(tasks) = fs::read_dir(format!("/proc/{}/task", pid)) else { continue };
        for task in tasks.flatten() {
            let children = task.path().join("children");
            if let Ok(content) = fs::read_to_string(children) {
                for child in content.split_whitespace().filter_map(|c| c.parse::<u32>().ok()) {
                    out.push(child);
                    queue.push(child);
                }
            }
        }
    }
    out
}

#[cfg(not(target_os = "linux"))]
fn descendant_pids(_root: u32) -> Vec<u32> {
    Vec::new()
}

/// Pid of a host process inside its innermost pid namespace — the last
/// column of `NSpid:` in /proc/<pid>/status. Differs from the host pid when
/// the terminal is sandboxed with bwrap --unshare-pid.
fn namespaced_pid(status: &str) -> Option<u32> {
    status
        .lines()
        .find_map(|l| l.strip_prefix("NSpid:"))
        .and_then(|cols| cols.split_whitespace().last())
        .and_then(|p| p.parse().ok())
}

/// Start time field of /proc/<pid>/stat. The comm field may contain spaces
/// and parens, so count fields after the last ')': state is field 3,
/// starttime field 22.
fn proc_start_time(stat: &str) -> Option<&str> {
    stat.rsplit_once(')')?.1.split_whitespace().nth(19)
}

/// Find the Claude session of a `claude` process running under the given PTY.
fn live_session_for_pty(pty_pid: u32) -> Option<LiveClaudeSession> {
    let home = crate::util::home_dir()?;
    let registry = PathBuf::from(home).join(".claude").join("sessions");
    descendant_pids(pty_pid).into_iter().find_map(|pid| {
        let status = fs::read_to_string(format!("/proc/{}/status", pid)).ok()?;
        let inner_pid = namespaced_pid(&status).unwrap_or(pid);
        let raw = fs::read_to_string(registry.join(format!("{}.json", inner_pid))).ok()?;
        let live = serde_json::from_str::<LiveClaudeSession>(&raw).ok()?;
        // Sandboxed tabs each start their own pid namespace, so several can
        // write the same <pid>.json; only accept the entry for this process.
        if let Some(ref expected) = live.proc_start {
            let stat = fs::read_to_string(format!("/proc/{}/stat", pid)).ok()?;
            if proc_start_time(&stat)? != expected {
                return None;
            }
        }
        Some(live)
    })
}

fn usage_from_session(session: SessionInfo, tab_bound: bool) -> TokenUsage {
    TokenUsage {
        input_tokens: session.input_tokens,
        output_tokens: session.output_tokens,
        cache_read_input_tokens: session.cache_read_input_tokens,
        cache_creation_input_tokens: session.cache_creation_input_tokens,
        billable_input_tokens: session.billable_input_tokens,
        billable_output_tokens: session.billable_output_tokens,
        model: session.model,
        session_file: Some(session.session_file),
        context_tokens: session.context_tokens,
        last_model: session.last_model,
        session_id: if session.session_id.is_empty() { None } else { Some(session.session_id) },
        tab_bound,
    }
}

/// Token usage for one tab. When `terminal_session_id` names a PTY that is
/// running `claude`, the usage is that process's own session; otherwise it
/// falls back to the most recently written session in `project_path`.
#[tauri::command]
pub async fn get_session_token_usage(
    project_path: String,
    terminal_session_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<TokenUsage, String> {
    let pty_pid = terminal_session_id.and_then(|id| {
        let guard = state.lock().ok()?;
        guard.pty_sessions.get(&id)?.child.process_id()
    });
    tauri::async_runtime::spawn_blocking(move || get_session_token_usage_internal(&project_path, pty_pid))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

fn get_session_token_usage_internal(project_path: &str, pty_pid: Option<u32>) -> Result<TokenUsage, String> {
    if let Some(live) = pty_pid.and_then(live_session_for_pty) {
        let dir = claude_sessions_dir(&live.cwd).ok_or("Could not get home directory")?;
        let file = dir.join(format!("{}.jsonl", live.session_id));
        // A fresh session has no transcript until the first message: it is
        // still this tab's session, so report zero rather than another one.
        if !file.exists() {
            return Ok(TokenUsage {
                session_id: Some(live.session_id),
                tab_bound: true,
                ..Default::default()
            });
        }
        let mut session = parse_session_file(&file)?;
        add_subagent_usage(&mut session, &file);
        return Ok(usage_from_session(session, true));
    }

    let sessions_dir = claude_sessions_dir(project_path).ok_or("Could not get home directory")?;
    if !sessions_dir.exists() {
        return Ok(TokenUsage::default());
    }

    // Find only the most recently modified .jsonl file
    let latest = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?
        .flatten()
        .filter(|e| is_jsonl(&e.path()))
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH));

    match latest {
        Some(entry) => {
            let path = entry.path();
            let mut session = parse_session_file(&path)?;
            add_subagent_usage(&mut session, &path);
            Ok(usage_from_session(session, false))
        }
        None => Ok(TokenUsage::default()),
    }
}

/// Fold the session's subagent transcripts (<session>/subagents/*.jsonl) into
/// its cumulative totals. Context fill stays that of the main conversation.
fn add_subagent_usage(info: &mut SessionInfo, session_file: &PathBuf) {
    let subagents_dir = session_file.with_extension("").join("subagents");
    let Ok(entries) = fs::read_dir(&subagents_dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_jsonl(&path) {
            continue;
        }
        if let Ok(sub) = parse_session_file(&path) {
            info.input_tokens += sub.input_tokens;
            info.output_tokens += sub.output_tokens;
            info.cache_read_input_tokens += sub.cache_read_input_tokens;
            info.cache_creation_input_tokens += sub.cache_creation_input_tokens;
            info.billable_input_tokens += sub.billable_input_tokens;
            info.billable_output_tokens += sub.billable_output_tokens;
            info.message_count += sub.message_count;
        }
    }
}

#[tauri::command]
pub async fn get_project_stats(project_path: String) -> Result<ProjectStats, String> {
    tauri::async_runtime::spawn_blocking(move || get_project_stats_internal(&project_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

fn get_project_stats_internal(project_path: &str) -> Result<ProjectStats, String> {
    let sessions_dir = claude_sessions_dir(project_path).ok_or("Could not get home directory")?;

    if !sessions_dir.exists() {
        return Ok(ProjectStats::default());
    }

    let entries = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    let mut sessions: Vec<SessionInfo> = Vec::new();
    let mut model_usage: HashMap<String, DailyActivity> = HashMap::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if is_jsonl(&path) {
            if let Ok(mut session_info) = parse_session_file(&path) {
                add_subagent_usage(&mut session_info, &path);
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

#[derive(Serialize)]
pub struct AllProjectsStats {
    pub projects: Vec<ProjectSummary>,
    pub totals: AllProjectsTotals,
}

#[derive(Serialize)]
pub struct ProjectSummary {
    pub path: String,
    pub name: String,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub session_count: u64,
    pub message_count: u64,
    pub last_activity: String,
    pub daily_average: u64,
    pub model_split: HashMap<String, f64>,
    pub daily_activity: Vec<DailyActivity>,
    pub sessions: Vec<SessionInfo>,
}

#[derive(Serialize)]
pub struct AllProjectsTotals {
    pub all_projects_tokens: u64,
    pub all_projects_cost: f64,
    pub total_sessions: u64,
}

#[tauri::command]
pub async fn get_all_projects_stats() -> Result<AllProjectsStats, String> {
    tauri::async_runtime::spawn_blocking(move || get_all_projects_stats_internal())
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

fn get_all_projects_stats_internal() -> Result<AllProjectsStats, String> {
    let home = crate::util::home_dir().ok_or("Could not get home directory")?;
    let projects_dir = PathBuf::from(&home).join(".claude").join("projects");

    if !projects_dir.exists() {
        return Ok(AllProjectsStats {
            projects: vec![],
            totals: AllProjectsTotals {
                all_projects_tokens: 0,
                all_projects_cost: 0.0,
                total_sessions: 0,
            },
        });
    }

    let entries = fs::read_dir(&projects_dir)
        .map_err(|e| format!("Failed to read projects directory: {}", e))?;

    let mut projects = Vec::new();
    let mut total_tokens: u64 = 0;
    let mut total_cost: f64 = 0.0;
    let mut total_sessions: u64 = 0;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let raw_dir_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        // Directory names encode paths: -home-enrique-projects-foo becomes "foo"
        // Try to extract the last path component by finding common parent patterns
        let dir_name = {
            let trimmed = raw_dir_name.trim_start_matches('-');
            // Look for "projects-" and take everything after the last occurrence
            if let Some(pos) = trimmed.rfind("projects-") {
                trimmed[pos + 9..].to_string()
            } else {
                // Fallback: take the last segment after the last dash
                trimmed.rsplit_once('-')
                    .map(|(_, last)| last.to_string())
                    .unwrap_or_else(|| trimmed.to_string())
            }
        };

        // Parse all session files in this project directory
        let session_entries = match fs::read_dir(&path) {
            Ok(e) => e,
            Err(_) => continue,
        };

        let mut sessions: Vec<SessionInfo> = Vec::new();
        let mut model_usage: HashMap<String, DailyActivity> = HashMap::new();
        let mut model_tokens: HashMap<String, u64> = HashMap::new();

        for se in session_entries.flatten() {
            let sp = se.path();
            if is_jsonl(&sp) {
                if let Ok(mut session_info) = parse_session_file(&sp) {
                    add_subagent_usage(&mut session_info, &sp);
                    let model = session_info.model.clone();
                    let ts = session_info.timestamp.clone();

                    let session_tokens = session_info.input_tokens + session_info.output_tokens + session_info.cache_read_input_tokens;
                    *model_tokens.entry(model.clone().unwrap_or_default()).or_insert(0) += session_tokens;

                    if !ts.is_empty() {
                        if let Some(date) = parse_timestamp(&ts) {
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

        if sessions.is_empty() {
            continue;
        }

        sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

        let proj_tokens: u64 = sessions.iter().map(|s| s.input_tokens + s.output_tokens + s.cache_read_input_tokens).sum();
        let proj_messages: u64 = sessions.iter().map(|s| s.message_count).sum();

        let mut daily_activity: Vec<DailyActivity> = model_usage.into_values().collect();
        daily_activity.sort_by(|a, b| b.date.cmp(&a.date));
        for activity in &mut daily_activity {
            activity.cost = calculate_cost(activity.input_tokens, activity.output_tokens, activity.cache_read_input_tokens, activity.cache_creation_input_tokens, activity.model.as_deref().unwrap_or("claude-sonnet-4-5-20250929"));
        }

        let proj_cost: f64 = daily_activity.iter().map(|a| a.cost).sum();
        let last_activity = sessions.first().map(|s| s.timestamp.clone()).unwrap_or_default();
        let last_activity_date = if last_activity.len() >= 10 { last_activity[..10].to_string() } else { last_activity.clone() };

        // Calculate daily average
        let unique_days: std::collections::HashSet<&str> = daily_activity.iter().map(|a| a.date.as_str()).collect();
        let day_count = unique_days.len().max(1) as u64;
        let daily_average = proj_tokens / day_count;

        // Model split as percentages
        let total_model_tokens: u64 = model_tokens.values().sum();
        let model_split: HashMap<String, f64> = model_tokens.into_iter().map(|(k, v)| {
            (k, if total_model_tokens > 0 { v as f64 / total_model_tokens as f64 } else { 0.0 })
        }).collect();

        let session_count = sessions.len() as u64;

        total_tokens += proj_tokens;
        total_cost += proj_cost;
        total_sessions += session_count;

        projects.push(ProjectSummary {
            path: raw_dir_name,
            name: dir_name,
            total_tokens: proj_tokens,
            total_cost: proj_cost,
            session_count,
            message_count: proj_messages,
            last_activity: last_activity_date,
            daily_average,
            model_split,
            daily_activity,
            sessions,
        });
    }

    // Sort by cost descending
    projects.sort_by(|a, b| b.total_cost.partial_cmp(&a.total_cost).unwrap_or(std::cmp::Ordering::Equal));

    Ok(AllProjectsStats {
        projects,
        totals: AllProjectsTotals {
            all_projects_tokens: total_tokens,
            all_projects_cost: total_cost,
            total_sessions,
        },
    })
}

/// Accumulated parse state for one session file, retained between calls so a
/// growing (append-only) JSONL is never re-read from the top.
#[derive(Default)]
struct CachedSession {
    /// Byte offset up to which complete lines have been merged into `usage_by_msg`.
    len: u64,
    /// Value of `CACHE_CLOCK` when last used, for least-recently-used eviction.
    last_used: u64,
    /// Usage keyed by message id (dedup: a resent id overwrites, never double-counts).
    usage_by_msg: HashMap<String, UsageData>,
    session_id: String,
    model: Option<String>,
    timestamp: Option<String>,
    /// Usage of the last assistant message seen (file order = chronological).
    last_usage: Option<UsageData>,
    /// Model id of that last assistant message.
    last_model: Option<String>,
}

/// Per-file incremental parse cache. Claude session files are append-only and
/// the active one is polled every 5s; without this each poll re-parsed the
/// entire (tens-of-MB) file, and get_project_stats re-parsed every session
/// file in the project on every call. Keyed by path, capped at
/// `SESSION_CACHE_CAPACITY` files with least-recently-used eviction.
static SESSION_USAGE_CACHE: Mutex<Option<HashMap<PathBuf, CachedSession>>> = Mutex::new(None);

/// Most session files kept parsed. Each holds a usage entry per message, so an
/// unbounded cache grew with every session ever opened in the dashboard.
const SESSION_CACHE_CAPACITY: usize = 200;

/// Logical clock for `CachedSession::last_used`.
static CACHE_CLOCK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn cache_tick() -> u64 {
    CACHE_CLOCK.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
}

/// Insert `state` for `path`, evicting the least recently used entry when full.
fn cache_insert(cache: &mut HashMap<PathBuf, CachedSession>, path: PathBuf, mut state: CachedSession) {
    state.last_used = cache_tick();
    if cache.len() >= SESSION_CACHE_CAPACITY && !cache.contains_key(&path) {
        if let Some(oldest) = cache
            .iter()
            .min_by_key(|(_, c)| c.last_used)
            .map(|(p, _)| p.clone())
        {
            cache.remove(&oldest);
        }
    }
    cache.insert(path, state);
}

/// Sum the cached per-message usage into a `SessionInfo` — cheap, no file I/O.
fn build_session_info(path: &PathBuf, c: &CachedSession) -> SessionInfo {
    let mut input_tokens = 0u64;
    let mut output_tokens = 0u64;
    let mut cache_read = 0u64;
    let mut cache_creation = 0u64;
    for u in c.usage_by_msg.values() {
        input_tokens += u.input_tokens.unwrap_or(0);
        output_tokens += u.output_tokens.unwrap_or(0);
        cache_read += u.cache_read_input_tokens.unwrap_or(0);
        cache_creation += u.cache_creation_input_tokens.unwrap_or(0);
    }
    SessionInfo {
        session_id: c.session_id.clone(),
        session_file: path.to_string_lossy().to_string(),
        model: c.model.clone(),
        input_tokens,
        output_tokens,
        cache_read_input_tokens: cache_read,
        cache_creation_input_tokens: cache_creation,
        billable_input_tokens: input_tokens + cache_creation,
        billable_output_tokens: output_tokens,
        message_count: c.usage_by_msg.len() as u64,
        timestamp: c.timestamp.clone().unwrap_or_default(),
        context_tokens: c.last_usage.as_ref().map(context_tokens_of).unwrap_or(0),
        last_model: c.last_model.clone(),
    }
}

/// Tokens occupying the context window for one assistant turn.
fn context_tokens_of(u: &UsageData) -> u64 {
    u.input_tokens.unwrap_or(0)
        + u.cache_read_input_tokens.unwrap_or(0)
        + u.cache_creation_input_tokens.unwrap_or(0)
}

/// Read complete (newline-terminated) lines from `reader` and merge them into
/// `state`. A trailing partial line (still being written) is left uncommitted
/// for the next poll. Returns the number of bytes consumed.
fn merge_session_lines<R: BufRead>(reader: &mut R, state: &mut CachedSession) -> u64 {
    let mut consumed = 0u64;
    let mut line: Vec<u8> = Vec::new();
    loop {
        line.clear();
        let n = match reader.read_until(b'\n', &mut line) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        // Stop at a partial final line (no newline yet) — don't consume it.
        if line.last() != Some(&b'\n') {
            break;
        }
        consumed += n as u64;
        let content = &line[..line.len() - 1];
        if content.is_empty() {
            continue;
        }
        if let Ok(msg) = serde_json::from_slice::<ClaudeMessage>(content) {
            if state.session_id.is_empty() {
                state.session_id = msg.session_id.or(msg.session_id_snake).unwrap_or_default();
            }
            if state.timestamp.is_none() {
                state.timestamp = msg.timestamp;
            }
            if let Some(message) = msg.message {
                if state.model.is_none() {
                    if let Some(ref m) = message.model {
                        if !m.starts_with('<') {
                            state.model = Some(m.clone());
                        }
                    }
                }
                // Track the latest real assistant turn for context fill.
                // Synthetic entries (model "<synthetic>") carry zeroed usage.
                let is_assistant = msg.kind.as_deref().map_or(true, |k| k == "assistant");
                let is_synthetic = message.model.as_deref().map_or(false, |m| m.starts_with('<'));
                if is_assistant && !is_synthetic {
                    if let Some(ref u) = message.usage {
                        state.last_usage = Some(u.clone());
                        if message.model.is_some() {
                            state.last_model = message.model.clone();
                        }
                    }
                }
                if let (Some(id), Some(u)) = (message.id, message.usage) {
                    state.usage_by_msg.insert(id, u);
                }
            }
        }
    }
    consumed
}

fn parse_session_file(path: &PathBuf) -> Result<SessionInfo, String> {
    let current_len = fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    // Consult the cache for a resume point. Lock is held only briefly here.
    let (mut state, start_offset) = {
        let mut guard = SESSION_USAGE_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        let cache = guard.get_or_insert_with(HashMap::new);
        // Unchanged since last parse — recompute totals from cached usage
        // with no file read. Hot path for the 5s poll between new messages
        // and for every unchanged file in get_project_stats.
        if let Some(c) = cache.get_mut(path) {
            if c.len == current_len {
                c.last_used = cache_tick();
                return Ok(build_session_info(path, c));
            }
        }
        // Take the entry out rather than cloning its whole message map; it
        // goes back in once the new lines are merged.
        match cache.remove(path) {
            // Grew (append-only) — resume from the last consumed offset.
            Some(c) if current_len > c.len => {
                let offset = c.len;
                (c, offset)
            }
            // New file, or truncated/rotated — parse from the start.
            _ => (CachedSession::default(), 0),
        }
    };

    let mut reader = super::transcript::open_at(path, start_offset)
        .map_err(|e| format!("Failed to open session file: {}", e))?;
    let consumed = merge_session_lines(&mut reader, &mut state);
    state.len = start_offset + consumed;

    let info = build_session_info(path, &state);
    {
        let mut guard = SESSION_USAGE_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        cache_insert(guard.get_or_insert_with(HashMap::new), path.clone(), state);
    }
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn last_assistant_usage_drives_context_tokens() {
        let jsonl = concat!(
            r#"{"type":"assistant","timestamp":"2026-10-14T10:00:00Z","message":{"id":"m1","model":"claude-opus-4-6","usage":{"input_tokens":10,"output_tokens":5,"cache_read_input_tokens":100,"cache_creation_input_tokens":20}}}"#, "\n",
            r#"{"type":"user","timestamp":"2026-10-14T10:00:05Z","message":{"role":"user","content":"hi"}}"#, "\n",
            r#"{"type":"assistant","timestamp":"2026-10-14T10:00:10Z","message":{"id":"m2","model":"claude-sonnet-4-5-20250929","usage":{"input_tokens":3,"output_tokens":7,"cache_read_input_tokens":1000,"cache_creation_input_tokens":50}}}"#, "\n",
        );
        let mut state = CachedSession::default();
        let consumed = merge_session_lines(&mut Cursor::new(jsonl.as_bytes()), &mut state);
        assert_eq!(consumed, jsonl.len() as u64);

        let info = build_session_info(&PathBuf::from("x.jsonl"), &state);
        assert_eq!(info.context_tokens, 3 + 1000 + 50);
        assert_eq!(info.last_model.as_deref(), Some("claude-sonnet-4-5-20250929"));
        // Cumulative totals still cover both assistant messages; the
        // usage-less user line is ignored.
        assert_eq!(info.message_count, 2);
        assert_eq!(info.input_tokens, 13);
        assert_eq!(info.model.as_deref(), Some("claude-opus-4-6"));
    }

    #[test]
    fn missing_usage_and_synthetic_do_not_reset_context() {
        let jsonl = concat!(
            r#"{"type":"assistant","message":{"id":"m1","model":"claude-opus-4-6","usage":{"input_tokens":1,"cache_read_input_tokens":2,"cache_creation_input_tokens":3}}}"#, "\n",
            r#"{"type":"assistant","message":{"id":"m2","model":"claude-opus-4-6"}}"#, "\n",
            r#"{"type":"assistant","message":{"id":"m3","model":"<synthetic>","usage":{"input_tokens":0,"output_tokens":0}}}"#, "\n",
            "not json at all\n",
        );
        let mut state = CachedSession::default();
        merge_session_lines(&mut Cursor::new(jsonl.as_bytes()), &mut state);
        let info = build_session_info(&PathBuf::from("x.jsonl"), &state);
        assert_eq!(info.context_tokens, 6);
        assert_eq!(info.last_model.as_deref(), Some("claude-opus-4-6"));
    }

    #[test]
    fn line_with_both_session_id_keys_still_counts_usage() {
        let jsonl = concat!(
            r#"{"type":"assistant","sessionId":"abc-123","session_id":"abc-123","message":{"id":"m1","model":"claude-opus-5-5","usage":{"input_tokens":2,"output_tokens":168,"cache_read_input_tokens":26477,"cache_creation_input_tokens":14697}}}"#, "\n",
        );
        let mut state = CachedSession::default();
        merge_session_lines(&mut Cursor::new(jsonl.as_bytes()), &mut state);
        let info = build_session_info(&PathBuf::from("x.jsonl"), &state);
        assert_eq!(info.session_id, "abc-123");
        assert_eq!(info.output_tokens, 168);
        assert_eq!(info.context_tokens, 2 + 26477 + 14697);
    }

    #[test]
    fn session_id_read_from_camel_case_key() {
        let jsonl = concat!(
            r#"{"type":"assistant","sessionId":"abc-123","message":{"id":"m1","model":"claude-opus-4-6","usage":{"input_tokens":1}}}"#, "\n",
        );
        let mut state = CachedSession::default();
        merge_session_lines(&mut Cursor::new(jsonl.as_bytes()), &mut state);
        assert_eq!(build_session_info(&PathBuf::from("x.jsonl"), &state).session_id, "abc-123");
    }

    #[test]
    fn project_dir_name_replaces_all_non_alphanumerics() {
        assert_eq!(claude_project_dir_name("/home/u/my_proj v2/.cfg@x"), "-home-u-my-proj-v2--cfg-x");
        assert_eq!(claude_project_dir_name("/home/enrique/projects/nevo-terminal"), "-home-enrique-projects-nevo-terminal");
    }

    #[test]
    fn subagent_usage_added_to_totals_not_context() {
        let dir = std::env::temp_dir().join(format!("nevo-tokens-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let main = dir.join("s1.jsonl");
        fs::create_dir_all(dir.join("s1").join("subagents")).unwrap();
        fs::write(&main, concat!(
            r#"{"type":"assistant","message":{"id":"m1","model":"claude-opus-4-6","usage":{"input_tokens":10,"output_tokens":5,"cache_read_input_tokens":100}}}"#, "\n",
        )).unwrap();
        fs::write(dir.join("s1").join("subagents").join("agent-a.jsonl"), concat!(
            r#"{"type":"assistant","message":{"id":"a1","model":"claude-haiku-4-5","usage":{"input_tokens":7,"output_tokens":3,"cache_read_input_tokens":50}}}"#, "\n",
        )).unwrap();

        let mut info = parse_session_file(&main).unwrap();
        add_subagent_usage(&mut info, &main);
        assert_eq!(info.input_tokens, 17);
        assert_eq!(info.output_tokens, 8);
        assert_eq!(info.cache_read_input_tokens, 150);
        assert_eq!(info.message_count, 2);
        assert_eq!(info.context_tokens, 110);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn namespaced_pid_uses_innermost_namespace() {
        assert_eq!(namespaced_pid("Name:\tclaude\nNSpid:\t569045\t2\nNSpgid:\t1\n"), Some(2));
        assert_eq!(namespaced_pid("NSpid:\t564494\n"), Some(564494));
        assert_eq!(namespaced_pid("Name:\tx\n"), None);
    }

    #[test]
    fn proc_start_time_handles_spaces_in_comm() {
        let stat = "569045 (my (odd) proc) S 569044 1 1 0 -1 4194560 100 0 0 0 1 2 0 0 20 0 11 0 10284320 7000 300";
        assert_eq!(proc_start_time(stat), Some("10284320"));
    }

    #[test]
    fn cache_evicts_least_recently_used() {
        let mut cache = HashMap::new();
        for i in 0..SESSION_CACHE_CAPACITY {
            cache_insert(&mut cache, PathBuf::from(format!("s{}", i)), CachedSession::default());
        }
        // Touch s0 so s1 becomes the oldest.
        cache.get_mut(&PathBuf::from("s0")).unwrap().last_used = cache_tick();
        cache_insert(&mut cache, PathBuf::from("new"), CachedSession::default());
        assert_eq!(cache.len(), SESSION_CACHE_CAPACITY);
        assert!(cache.contains_key(&PathBuf::from("s0")));
        assert!(!cache.contains_key(&PathBuf::from("s1")));
    }

    #[test]
    fn empty_session_has_zero_context() {
        let state = CachedSession::default();
        let info = build_session_info(&PathBuf::from("x.jsonl"), &state);
        assert_eq!(info.context_tokens, 0);
        assert!(info.last_model.is_none());
    }
}
