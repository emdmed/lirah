use crate::claude::types::{ClaudeSessionEntry, ClaudeSessionsPage, SubagentInfo, SubagentStatus};
use crate::watch_registry::{drain_debounced, Acquired, WatchRegistry};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

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

/// Get the Claude Code sessions index for a project (paginated)
fn get_claude_sessions(
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

/// Get the most recent active session for a project.
///
/// `async` because this is not cheap: it scans every session file for the
/// project, which measured 1.14s on a project with 272 of them. Tauri runs sync
/// commands on the main thread, so as a sync command it froze the UI for that
/// whole second.
#[tauri::command]
pub async fn get_active_claude_session(
    project_path: String,
) -> Result<Option<ClaudeSessionEntry>, String> {
    // The scan is blocking and slow, so it goes to the blocking pool rather than
    // occupying an async worker for a second.
    tauri::async_runtime::spawn_blocking(move || {
        let page = get_claude_sessions(project_path, Some(1), Some(0))?;
        // Return the first (most recent) non-sidechain session
        Ok(page.sessions.into_iter().find(|s| !s.is_sidechain))
    })
    .await
    .map_err(|e| format!("Session scan failed: {}", e))?
}

/// Encode a project path for the Claude directory structure
/// So /home/enrique/projects/nevo-terminal becomes -home-enrique-projects-nevo-terminal
fn encode_project_path(path: &str) -> String {
    crate::fs::claude_project_dir_name(path)
}

/// Store for the subagent filesystem watchers, ref-counted per project path.
pub struct SubagentWatcherStore {
    registry: WatchRegistry<String, SubagentWatcherHandle>,
}

struct SubagentWatcherHandle {
    // Dropping the sender stops the debounce thread, which owns the watcher.
    _stop_tx: std::sync::mpsc::Sender<()>,
}

impl SubagentWatcherStore {
    pub fn new() -> Self {
        Self {
            registry: WatchRegistry::new(),
        }
    }
}

/// A subagent whose transcript was written this recently is still running.
const SUBAGENT_RUNNING_WINDOW: Duration = Duration::from_secs(30);

/// The fields of a transcript line that the subagent list needs. Everything
/// else (tool inputs, results, thinking) is skipped by serde without being
/// materialized.
#[derive(Deserialize)]
struct TranscriptLine {
    #[serde(rename = "agentId")]
    agent_id: Option<String>,
    // Both spellings can appear on one line, so they are separate fields
    // rather than an alias (an alias rejects the line as a duplicate field).
    #[serde(rename = "agent_id")]
    agent_id_snake: Option<String>,
    slug: Option<String>,
    timestamp: Option<String>,
    message: Option<TranscriptMessage>,
}

#[derive(Deserialize)]
struct TranscriptMessage {
    content: Option<TranscriptContent>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum TranscriptContent {
    Text(String),
    Blocks(Vec<TranscriptBlock>),
    Other(serde::de::IgnoredAny),
}

#[derive(Deserialize)]
struct TranscriptBlock {
    #[serde(rename = "type")]
    kind: Option<String>,
    name: Option<String>,
    text: Option<String>,
}

/// Parse state of one `agent-*.jsonl`, kept between calls so a growing
/// transcript is only read from where the previous call stopped.
#[derive(Default)]
struct CachedSubagent {
    /// File length and mtime when last read; both unchanged means nothing to do.
    file_len: u64,
    mtime: Option<SystemTime>,
    /// Bytes of complete lines merged so far (a trailing partial line is not).
    consumed: u64,
    /// The first line was not a JSON object; the file is not listed.
    invalid: bool,
    has_header: bool,
    agent_id: String,
    slug: String,
    description: String,
    started_at: String,
    message_count: u32,
    last_tool: Option<String>,
    last_activity: String,
}

/// Per-file subagent parse cache. Pruned to the files seen by the latest scan
/// of each project, so it is bounded by the transcripts currently listed.
static SUBAGENT_CACHE: Mutex<Option<HashMap<PathBuf, CachedSubagent>>> = Mutex::new(None);

fn first_text(content: &TranscriptContent) -> Option<&str> {
    match content {
        TranscriptContent::Text(s) => Some(s),
        TranscriptContent::Blocks(blocks) => blocks.iter().find_map(|b| b.text.as_deref()),
        TranscriptContent::Other(_) => None,
    }
}

/// Merge complete lines from `reader` into `state`; returns the bytes consumed.
fn merge_subagent_lines<R: BufRead>(reader: &mut R, state: &mut CachedSubagent) -> u64 {
    let mut consumed = 0u64;
    let mut line: Vec<u8> = Vec::new();
    loop {
        line.clear();
        let n = match reader.read_until(b'\n', &mut line) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        // A final line without its newline is still being written.
        if line.last() != Some(&b'\n') {
            break;
        }
        consumed += n as u64;
        let content = line[..line.len() - 1].trim_ascii();
        if content.is_empty() {
            continue;
        }
        let parsed = serde_json::from_slice::<TranscriptLine>(content).ok();

        if !state.has_header {
            let Some(first) = parsed else {
                state.invalid = true;
                break;
            };
            state.has_header = true;
            state.agent_id = first.agent_id.or(first.agent_id_snake).unwrap_or_default();
            state.slug = first.slug.unwrap_or_default();
            state.started_at = first.timestamp.unwrap_or_default();
            state.last_activity = state.started_at.clone();
            state.description = first
                .message
                .as_ref()
                .and_then(|m| m.content.as_ref())
                .and_then(first_text)
                .map(|s| s.chars().take(500).collect())
                .unwrap_or_default();
            state.message_count = 1;
            continue;
        }

        state.message_count += 1;
        let Some(parsed) = parsed else { continue };
        if let Some(ts) = parsed.timestamp {
            state.last_activity = ts;
        }
        if let Some(TranscriptContent::Blocks(blocks)) = parsed.message.and_then(|m| m.content) {
            for block in blocks {
                if block.kind.as_deref() == Some("tool_use") {
                    if let Some(name) = block.name {
                        state.last_tool = Some(name);
                    }
                }
            }
        }
    }
    consumed
}

/// Bring the cached parse of one transcript up to date and describe it.
fn load_subagent(
    path: &Path,
    file_len: u64,
    mtime: Option<SystemTime>,
    now: SystemTime,
) -> Option<SubagentInfo> {
    // Take the entry out (no clone) and put it back when done.
    let cached = {
        let mut guard = SUBAGENT_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        guard.get_or_insert_with(HashMap::new).remove(path)
    };
    let mut state = match cached {
        Some(c) if c.file_len == file_len && c.mtime == mtime => c,
        // Appended to: resume after the last complete line.
        Some(c) if file_len > c.file_len && !c.invalid => c,
        // New, truncated or rewritten: start over.
        _ => CachedSubagent::default(),
    };

    if state.file_len != file_len || state.mtime != mtime || state.consumed == 0 {
        if let Ok(file) = fs::File::open(path) {
            let mut reader = BufReader::new(file);
            if reader.seek(SeekFrom::Start(state.consumed)).is_ok() {
                let consumed = merge_subagent_lines(&mut reader, &mut state);
                state.consumed += consumed;
            }
        }
        state.file_len = file_len;
        state.mtime = mtime;
    }

    let info = (state.has_header && !state.invalid).then(|| {
        let age = mtime
            .and_then(|m| now.duration_since(m).ok())
            .unwrap_or_default();
        SubagentInfo {
            agent_id: state.agent_id.clone(),
            slug: state.slug.clone(),
            status: if age < SUBAGENT_RUNNING_WINDOW {
                SubagentStatus::Running
            } else {
                SubagentStatus::Completed
            },
            description: state.description.clone(),
            last_tool: state.last_tool.clone(),
            message_count: state.message_count,
            started_at: state.started_at.clone(),
            last_activity: state.last_activity.clone(),
        }
    });

    let mut guard = SUBAGENT_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    guard
        .get_or_insert_with(HashMap::new)
        .insert(path.to_path_buf(), state);
    info
}

fn project_subagents_blocking(
    project_path: &str,
    since_ms: Option<u64>,
) -> Result<Vec<SubagentInfo>, String> {
    let encoded_path = encode_project_path(project_path);
    let claude_dir = find_claude_data_dir().ok_or("Could not find Claude Code data directory")?;

    let project_dir = claude_dir.join("projects").join(&encoded_path);
    if !project_dir.exists() {
        return Ok(Vec::new());
    }

    let now = SystemTime::now();
    // Transcripts untouched since before the caller's cutoff are neither
    // running nor recent, and the frontend would drop them; skip them unread.
    let cutoff = since_ms.map(|ms| {
        let since = UNIX_EPOCH + Duration::from_millis(ms);
        let running_floor = now.checked_sub(SUBAGENT_RUNNING_WINDOW).unwrap_or(UNIX_EPOCH);
        since.min(running_floor)
    });

    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut all_subagents = Vec::new();

    // Scan all session directories for subagents
    let sessions = fs::read_dir(&project_dir).map_err(|e| e.to_string())?;
    for session in sessions.flatten() {
        let Ok(transcripts) = fs::read_dir(session.path().join("subagents")) else {
            continue;
        };
        for transcript in transcripts.flatten() {
            let path = transcript.path();
            let is_transcript = path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("agent-") && n.ends_with(".jsonl"));
            if !is_transcript {
                continue;
            }
            let Ok(meta) = transcript.metadata() else { continue };
            let mtime = meta.modified().ok();
            if let (Some(cutoff), Some(mtime)) = (cutoff, mtime) {
                if mtime < cutoff {
                    continue;
                }
            }
            if let Some(info) = load_subagent(&path, meta.len(), mtime, now) {
                all_subagents.push(info);
            }
            seen.insert(path);
        }
    }

    // Forget transcripts of this project that this scan did not use.
    if let Some(cache) = SUBAGENT_CACHE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_mut()
    {
        cache.retain(|path, _| !path.starts_with(&project_dir) || seen.contains(path));
    }

    // Sort by started_at descending (most recent first)
    all_subagents.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    Ok(all_subagents)
}

/// Get all subagents across all sessions for a project.
///
/// Transcripts are parsed incrementally: an unchanged file costs one stat, a
/// growing one only its new lines. With `since_ms` (unix ms), transcripts last
/// written before it, and not within the running window, are skipped.
#[tauri::command]
pub async fn get_project_subagents(
    project_path: String,
    since_ms: Option<u64>,
) -> Result<Vec<SubagentInfo>, String> {
    crate::ipc::blocking("get_project_subagents", move || {
        project_subagents_blocking(&project_path, since_ms)
    })
    .await
}

fn build_subagent_watcher(
    project_path: String,
    app_handle: tauri::AppHandle,
) -> Result<SubagentWatcherHandle, String> {
    use notify::{RecommendedWatcher, RecursiveMode, Watcher};
    use std::sync::mpsc;
    use tauri::Emitter;

    let encoded_path = encode_project_path(&project_path);
    let claude_dir = find_claude_data_dir().ok_or("Could not find Claude Code data directory")?;

    let project_dir = claude_dir.join("projects").join(&encoded_path);
    if !project_dir.exists() {
        return Err("Project directory not found".to_string());
    }

    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (event_tx, event_rx) = mpsc::channel::<()>();

    let mut watcher: RecommendedWatcher =
        notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                // Only emit for subagent file changes
                let is_subagent = event
                    .paths
                    .iter()
                    .any(|p| p.to_string_lossy().contains("/subagents/"));
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

    // Debounce thread — emits project_path so frontend knows which path changed
    std::thread::spawn(move || {
        let _watcher = watcher; // keep alive
        let quiet = Duration::from_millis(500);
        let max_wait = Duration::from_secs(2);

        loop {
            match stop_rx.try_recv() {
                Ok(()) | Err(mpsc::TryRecvError::Disconnected) => break,
                Err(mpsc::TryRecvError::Empty) => {}
            }

            match event_rx.recv_timeout(Duration::from_millis(200)) {
                Ok(()) => {
                    drain_debounced(&event_rx, Instant::now(), quiet, max_wait, |_| {});
                    let _ = app_handle.emit("subagents-changed", &project_path);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    Ok(SubagentWatcherHandle { _stop_tx: stop_tx })
}

/// Start watching a project's subagent directories for changes. Ref-counted:
/// each call must be paired with `stop_project_subagents_watcher`.
#[tauri::command]
pub async fn watch_project_subagents(
    project_path: String,
    app_handle: tauri::AppHandle,
    store: tauri::State<'_, Arc<SubagentWatcherStore>>,
) -> Result<(), String> {
    let store = store.inner().clone();
    let Acquired::New(generation) = store.registry.acquire(&project_path) else {
        return Ok(());
    };
    let key = project_path.clone();
    let built = crate::ipc::blocking("watch_project_subagents", move || {
        build_subagent_watcher(project_path, app_handle)
    })
    .await;
    match built {
        Ok(handle) => {
            store.registry.attach(&key, generation, handle);
            Ok(())
        }
        Err(e) => {
            store.registry.abandon(&key, generation);
            Err(e)
        }
    }
}

/// Release one user of a project's subagent watcher; it stops with the last.
#[tauri::command]
pub fn stop_project_subagents_watcher(
    project_path: String,
    store: tauri::State<std::sync::Arc<SubagentWatcherStore>>,
) -> Result<(), String> {
    store.registry.release(&project_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn subagent_lines_merge_incrementally() {
        let first = concat!(
            r#"{"agentId":"a1","slug":"explore","timestamp":"T0","message":{"role":"user","content":"Find the bug"}}"#, "\n",
            r#"{"timestamp":"T1","message":{"content":[{"type":"tool_use","name":"Grep","input":{"q":1}}]}}"#, "\n",
            r#"{"timestamp":"T2","message":{"con"#,
        );
        let mut state = CachedSubagent::default();
        let consumed = merge_subagent_lines(&mut Cursor::new(first.as_bytes()), &mut state);
        assert_eq!(state.agent_id, "a1");
        assert_eq!(state.description, "Find the bug");
        assert_eq!(state.message_count, 2);
        assert_eq!(state.last_tool.as_deref(), Some("Grep"));
        assert_eq!(state.last_activity, "T1");

        // The partial line was left for the next call.
        let rest = concat!(
            r#"{"timestamp":"T2","message":{"content":[{"type":"text","text":"ok"},{"type":"tool_use","name":"Read"}]}}"#, "\n",
        );
        state.consumed = consumed;
        merge_subagent_lines(&mut Cursor::new(rest.as_bytes()), &mut state);
        assert_eq!(state.message_count, 3);
        assert_eq!(state.last_tool.as_deref(), Some("Read"));
        assert_eq!(state.last_activity, "T2");
    }

    #[test]
    fn description_from_text_block_and_snake_case_id() {
        let jsonl = concat!(
            r#"{"agent_id":"b2","agentId":"b2","message":{"content":[{"type":"text","text":"Plan it"}]}}"#, "\n",
        );
        let mut state = CachedSubagent::default();
        merge_subagent_lines(&mut Cursor::new(jsonl.as_bytes()), &mut state);
        assert_eq!(state.agent_id, "b2");
        assert_eq!(state.description, "Plan it");
    }

    #[test]
    fn invalid_first_line_hides_transcript() {
        let mut state = CachedSubagent::default();
        merge_subagent_lines(&mut Cursor::new(b"not json\n{}\n".as_slice()), &mut state);
        assert!(state.invalid);
        assert!(!state.has_header);
    }
}
