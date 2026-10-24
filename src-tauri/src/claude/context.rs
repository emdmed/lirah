//! What fills a Claude session's context window.
//!
//! Recent Claude Code versions log every API request in the session file:
//! `api-request` records name a base request, how many of its messages to
//! keep, and the hashes of the messages appended (`api-request-blob`), with
//! the system prompt and tool definitions in `api-request-shape`. Rebuilding
//! the last request gives the exact contents sent. Most of Claude's own
//! turns and all tool results are not stored as blobs: a missing turn is
//! rebuilt from the `assistant` records answering the base request (by
//! `requestRef`), and missing tool results from the `user` records by
//! tool_use id.
//!
//! Older sessions have no request log; their breakdown is estimated from the
//! conversation records since the last compaction, and whatever the API
//! reported beyond that (system prompt, tool definitions) is one remainder.
//!
//! Sizes are measured in characters and scaled so the parts add up to the
//! context size the API reported for that request. Images are sized in
//! tokens from their dimensions instead.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use super::transcript::is_jsonl;

/// Tokens for an image whose dimensions can't be read (the API's ceiling).
const IMAGE_TOKENS: u64 = 1600;
const MAX_ITEMS: usize = 400;
/// Used only when a session has no usage record to scale against.
const CHARS_PER_TOKEN: f64 = 3.5;

#[derive(Serialize, Default)]
pub struct ContextBreakdown {
    pub session_file: String,
    /// "request": rebuilt from the logged API request.
    /// "transcript": estimated from conversation records (no request log).
    pub source: &'static str,
    /// Context size the API reported (or the estimate when `reported` is false).
    pub total_tokens: u64,
    pub reported: bool,
    pub model: Option<String>,
    pub timestamp: Option<String>,
    pub message_count: usize,
    /// Which main-thread request this is, 1-based, out of `request_count`.
    pub request_index: usize,
    pub request_count: usize,
    pub groups: Vec<GroupTotal>,
    pub tools: Vec<ToolTotal>,
    pub files: Vec<FileTotal>,
    /// Largest pieces first, at most MAX_ITEMS.
    pub items: Vec<Item>,
}

#[derive(Serialize)]
pub struct GroupTotal {
    pub group: &'static str,
    pub tokens: u64,
    pub count: usize,
}

#[derive(Serialize, Default)]
pub struct ToolTotal {
    pub name: String,
    pub calls: usize,
    pub input_tokens: u64,
    pub result_tokens: u64,
}

#[derive(Serialize, Default)]
pub struct FileTotal {
    pub path: String,
    pub read_tokens: u64,
    pub write_tokens: u64,
    pub reads: usize,
    pub writes: usize,
}

#[derive(Serialize)]
pub struct Item {
    pub group: &'static str,
    pub kind: String,
    pub label: String,
    pub tokens: u64,
}

/// Group keys, in display order.
pub const GROUPS: [&str; 11] = [
    "results", "calls", "thinking", "reminders", "tools", "system",
    "replies", "prompts", "images", "unlogged", "other",
];

#[derive(Clone, Copy, PartialEq)]
enum ToolPart { Input, Result }

struct Raw {
    group: &'static str,
    kind: String,
    label: String,
    chars: u64,
    /// Tokens that are not scaled (images).
    fixed: u64,
    tool: Option<(String, ToolPart)>,
    /// (path, is_write)
    file: Option<(String, bool)>,
}

impl Raw {
    fn new(group: &'static str, kind: impl Into<String>, label: impl Into<String>, chars: u64) -> Self {
        Raw { group, kind: kind.into(), label: label.into(), chars, fixed: 0, tool: None, file: None }
    }
}

#[tauri::command]
pub async fn get_context_breakdown(session_file: String) -> Result<ContextBreakdown, String> {
    crate::ipc::blocking("get_context_breakdown", move || {
        let path = checked_session_path(&session_file)?;
        breakdown(&path)
    })
    .await
}

/// Only Claude transcripts under ~/.claude/projects may be read.
fn checked_session_path(session_file: &str) -> Result<PathBuf, String> {
    let home = crate::util::home_dir().ok_or("Could not get home directory")?;
    let root = home.join(".claude").join("projects").canonicalize().map_err(|e| e.to_string())?;
    let path = Path::new(session_file).canonicalize().map_err(|e| format!("{}: {}", session_file, e))?;
    if !path.starts_with(&root) || !is_jsonl(&path) {
        return Err("Not a Claude session transcript".into());
    }
    Ok(path)
}

#[derive(Default)]
struct Log {
    requests: Vec<Value>,
    request_ix: HashMap<String, usize>,
    blobs: HashMap<String, Value>,
    shapes: HashMap<String, Value>,
    /// Shape most recently seen before each request, by request index.
    shape_before: Vec<Option<String>>,
    usage_by_request: HashMap<String, Value>,
    results_by_id: HashMap<String, Value>,
    /// Content blocks of Claude's answer to each request, by request id.
    answers: HashMap<String, Vec<Value>>,
    /// Main-conversation records (user / assistant / attachment / system).
    records: Vec<Value>,
}

fn read_log(path: &Path) -> Result<Log, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut log = Log::default();
    let mut last_shape: Option<String> = None;
    for line in BufReader::new(file).split(b'\n').map_while(Result::ok) {
        let Ok(mut d) = serde_json::from_slice::<Value>(&line) else { continue };
        match d.get("type").and_then(Value::as_str).unwrap_or("") {
            "api-request" => {
                if let Some(id) = d.get("id").and_then(Value::as_str) {
                    log.request_ix.insert(id.to_string(), log.requests.len());
                }
                log.shape_before.push(last_shape.clone());
                log.requests.push(d);
            }
            "api-request-blob" => {
                if let (Some(hash), Some(msg)) = (d.get("hash").and_then(Value::as_str).map(String::from), d.get_mut("message")) {
                    log.blobs.insert(hash, msg.take());
                }
            }
            "api-request-shape" => {
                let key = d.get("shapeHash").or_else(|| d.get("hash")).and_then(Value::as_str).map(String::from);
                if let (Some(key), Some(shape)) = (key, d.get_mut("shape")) {
                    log.shapes.insert(key.clone(), shape.take());
                    last_shape = Some(key);
                }
            }
            kind @ ("user" | "assistant" | "attachment" | "system") => {
                if d.get("isSidechain").and_then(Value::as_bool) == Some(true) {
                    continue;
                }
                if kind == "user" {
                    if let Some(blocks) = d.pointer("/message/content").and_then(Value::as_array) {
                        for b in blocks {
                            if b.get("type").and_then(Value::as_str) == Some("tool_result") {
                                if let Some(id) = b.get("tool_use_id").and_then(Value::as_str) {
                                    log.results_by_id.insert(id.to_string(), b.clone());
                                }
                            }
                        }
                    }
                }
                if kind == "assistant" {
                    if let Some(r) = d.get("requestRef").and_then(Value::as_str) {
                        if let Some(u) = d.pointer("/message/usage") {
                            log.usage_by_request.insert(r.to_string(), u.clone());
                        }
                        // One record per content block; join them back into the turn.
                        if let Some(blocks) = d.pointer("/message/content").and_then(Value::as_array) {
                            log.answers.entry(r.to_string()).or_default().extend(blocks.iter().cloned());
                        }
                    }
                }
                log.records.push(d);
            }
            _ => {}
        }
    }
    Ok(log)
}

fn context_tokens(u: &Value) -> u64 {
    ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]
        .iter()
        .map(|k| u.get(*k).and_then(Value::as_u64).unwrap_or(0))
        .sum()
}

pub fn breakdown(path: &Path) -> Result<ContextBreakdown, String> {
    let log = read_log(path)?;
    let mut out = if log.requests.is_empty() {
        from_transcript(&log)
    } else {
        from_request(&log)
    };
    out.session_file = path.to_string_lossy().into_owned();
    Ok(out)
}

// ---------------------------------------------------------------------------
// Rebuilding a logged request

/// Messages of request `ix`: its base's first `keep` messages plus its tail.
fn request_messages(log: &Log, ix: usize) -> Vec<Value> {
    let mut chain = vec![ix];
    let mut cur = ix;
    while let Some(base) = log.requests[cur].get("base").and_then(Value::as_str) {
        match log.request_ix.get(base) {
            Some(&b) if !chain.contains(&b) => {
                chain.push(b);
                cur = b;
            }
            _ => break,
        }
    }
    let mut msgs: Vec<Value> = Vec::new();
    for &r in chain.iter().rev() {
        let req = &log.requests[r];
        if req.get("base").and_then(Value::as_str).is_some() {
            let keep = req.get("keep").and_then(Value::as_u64).unwrap_or(0) as usize;
            msgs.truncate(keep);
        }
        for hash in req.get("tail").and_then(Value::as_array).into_iter().flatten() {
            let hash = hash.as_str().unwrap_or("");
            if let Some(m) = log.blobs.get(hash) {
                msgs.push(m.clone());
                continue;
            }
            // Missing blob. After one of Claude's turns it is the tool results
            // answering it; otherwise it is Claude's answer to the base request.
            let last = msgs.last();
            if last.and_then(|m| m.get("role")?.as_str()) == Some("assistant") {
                let ids: Vec<&str> = last
                    .and_then(|m| m.get("content")?.as_array())
                    .into_iter()
                    .flatten()
                    .filter(|b| b.get("type").and_then(Value::as_str) == Some("tool_use"))
                    .filter_map(|b| b.get("id")?.as_str())
                    .collect();
                let found: Vec<Value> = ids.iter().filter_map(|id| log.results_by_id.get(*id).cloned()).collect();
                if !found.is_empty() {
                    msgs.push(serde_json::json!({ "role": "user", "content": found }));
                }
            } else if let Some(blocks) = req.get("base").and_then(Value::as_str).and_then(|b| log.answers.get(b)) {
                msgs.push(serde_json::json!({ "role": "assistant", "content": blocks }));
            }
        }
    }
    msgs
}

fn from_request(log: &Log) -> ContextBreakdown {
    let main: Vec<usize> = {
        let m: Vec<usize> = (0..log.requests.len())
            .filter(|&i| log.requests[i].get("querySource").and_then(Value::as_str) == Some("repl_main_thread"))
            .collect();
        if m.is_empty() { (0..log.requests.len()).collect() } else { m }
    };
    let id_of = |i: usize| log.requests[i].get("id").and_then(Value::as_str).unwrap_or("").to_string();
    // The newest request may still be in flight; prefer the last one answered.
    let pos = main.iter().rposition(|&i| log.usage_by_request.contains_key(&id_of(i))).unwrap_or(main.len() - 1);
    let ix = main[pos];
    let req = &log.requests[ix];
    let msgs = request_messages(log, ix);

    let shape = req
        .get("shapeHash")
        .and_then(Value::as_str)
        .and_then(|h| log.shapes.get(h))
        .or_else(|| log.shape_before[ix].as_ref().and_then(|h| log.shapes.get(h)));

    let mut raws: Vec<Raw> = Vec::new();
    if let Some(shape) = shape {
        for b in shape.get("system").and_then(Value::as_array).into_iter().flatten() {
            let text = b.get("text").and_then(Value::as_str).unwrap_or("");
            raws.push(Raw::new("system", "System prompt", snippet(text, 90), chars(text)));
        }
        for t in shape.get("tools").and_then(Value::as_array).into_iter().flatten() {
            let name = t.get("name").and_then(Value::as_str).unwrap_or("?");
            raws.push(Raw::new("tools", "Tool definition", name, json_chars(t)));
        }
    }
    measure_messages(&msgs, &mut raws);

    let usage = log.usage_by_request.get(&id_of(ix));
    let mut out = finish(raws, usage.map(context_tokens));
    out.source = "request";
    out.model = req.pointer("/params/model").and_then(Value::as_str).map(String::from);
    out.timestamp = req.get("timestamp").and_then(Value::as_str).map(String::from);
    out.message_count = msgs.len();
    out.request_index = pos + 1;
    out.request_count = main.len();
    out
}

// ---------------------------------------------------------------------------
// Estimating from conversation records (no request log)

fn from_transcript(log: &Log) -> ContextBreakdown {
    let start = log
        .records
        .iter()
        .rposition(|d| d.get("subtype").and_then(Value::as_str) == Some("compact_boundary"))
        .map(|i| i + 1)
        .unwrap_or(0);
    let records = &log.records[start..];

    let mut msgs: Vec<Value> = Vec::new();
    let mut raws: Vec<Raw> = Vec::new();
    let mut last_usage: Option<&Value> = None;
    let mut model = None;
    let mut timestamp = None;
    for d in records {
        match d.get("type").and_then(Value::as_str).unwrap_or("") {
            "user" | "assistant" => {
                let Some(m) = d.get("message") else { continue };
                if d.get("isCompactSummary").and_then(Value::as_bool) == Some(true) {
                    let text = m.get("content").map(content_text).unwrap_or_default();
                    raws.push(Raw::new("reminders", "Compaction summary", snippet(&text, 90), chars(&text)));
                    continue;
                }
                if let Some(u) = m.get("usage") {
                    last_usage = Some(u);
                    model = m.get("model").and_then(Value::as_str).map(String::from);
                    timestamp = d.get("timestamp").and_then(Value::as_str).map(String::from);
                }
                msgs.push(m.clone());
            }
            "attachment" => {
                if let Some(raw) = attachment_raw(d.get("attachment").unwrap_or(&Value::Null)) {
                    raws.push(raw);
                }
            }
            _ => {}
        }
    }
    measure_messages(&msgs, &mut raws);

    let reported = last_usage.map(context_tokens).filter(|&t| t > 0);
    let mut out = match reported {
        Some(total) => {
            // Messages at a typical ratio; the rest of what the API reported
            // is the system prompt, tool definitions and unlogged reminders.
            let fixed: u64 = raws.iter().map(|r| r.fixed).sum();
            let est: u64 = fixed + (raws.iter().map(|r| r.chars).sum::<u64>() as f64 / CHARS_PER_TOKEN) as u64;
            if total > est {
                let mut r = Raw::new("unlogged", "Not in transcript", "System prompt, tool definitions, skill and agent lists", 0);
                r.fixed = total - est;
                raws.push(r);
                finish_with_ratio(raws, total, 1.0 / CHARS_PER_TOKEN)
            } else {
                finish(raws, Some(total))
            }
        }
        None => finish(raws, None),
    };
    out.source = "transcript";
    out.model = model;
    out.timestamp = timestamp;
    out.message_count = msgs.len();
    out
}

fn attachment_raw(a: &Value) -> Option<Raw> {
    let kind = match a.get("type").and_then(Value::as_str)? {
        "hook_success" | "hook_additional_context" => "Hook output",
        "queued_command" => "Background task notice",
        "skill_listing" => "Skill list",
        "edited_text_file" => "Edited file notice",
        "total_tokens_reminder" | "silent_turn_reminder" => "System reminder",
        _ => return None,
    };
    let text = ["content", "prompt", "snippet", "text"]
        .iter()
        .find_map(|k| a.get(*k))
        .map(content_text)
        .unwrap_or_default();
    if text.is_empty() {
        return None;
    }
    let label = a.get("hookName").and_then(Value::as_str).map(String::from)
        .or_else(|| a.get("filename").and_then(Value::as_str).map(String::from))
        .unwrap_or_else(|| snippet(&text, 90));
    Some(Raw::new("reminders", kind, label, chars(&text)))
}

// ---------------------------------------------------------------------------
// Measuring messages

fn measure_messages(msgs: &[Value], raws: &mut Vec<Raw>) {
    let mut tool_uses: HashMap<&str, (&str, &Value)> = HashMap::new();
    for m in msgs {
        for b in m.get("content").and_then(Value::as_array).into_iter().flatten() {
            if b.get("type").and_then(Value::as_str) == Some("tool_use") {
                if let Some(id) = b.get("id").and_then(Value::as_str) {
                    let name = b.get("name").and_then(Value::as_str).unwrap_or("?");
                    tool_uses.insert(id, (name, b.get("input").unwrap_or(&Value::Null)));
                }
            }
        }
    }

    for m in msgs {
        let role = m.get("role").and_then(Value::as_str).unwrap_or("user");
        let blocks: Vec<Value> = match m.get("content") {
            Some(Value::String(s)) => vec![serde_json::json!({ "type": "text", "text": s })],
            Some(Value::Array(a)) => a.clone(),
            _ => continue,
        };
        for b in &blocks {
            match b.get("type").and_then(Value::as_str).unwrap_or("") {
                "text" => {
                    let text = b.get("text").and_then(Value::as_str).unwrap_or("");
                    if role == "system" && text.chars().take(6000).collect::<String>().contains("# Environment") {
                        raws.extend(startup_raws(text));
                    } else {
                        raws.push(text_raw(role, text));
                    }
                }
                "thinking" => {
                    let n = str_chars(b, "thinking") + str_chars(b, "signature");
                    let text = b.get("thinking").and_then(Value::as_str).unwrap_or("");
                    raws.push(Raw::new("thinking", "Thinking", snippet(text, 90), n));
                }
                "redacted_thinking" => {
                    raws.push(Raw::new("thinking", "Thinking", "(redacted)", str_chars(b, "data")));
                }
                "tool_use" => {
                    let name = b.get("name").and_then(Value::as_str).unwrap_or("?");
                    let input = b.get("input").unwrap_or(&Value::Null);
                    let mut r = Raw::new("calls", name, tool_target(input), json_chars(input));
                    r.tool = Some((name.to_string(), ToolPart::Input));
                    if matches!(name, "Write" | "Edit" | "MultiEdit" | "NotebookEdit") {
                        if let Some(p) = file_arg(input) {
                            r.file = Some((p, true));
                        }
                    }
                    raws.push(r);
                }
                "tool_result" => {
                    let id = b.get("tool_use_id").and_then(Value::as_str).unwrap_or("");
                    let (name, input) = tool_uses.get(id).copied().unwrap_or(("?", &Value::Null));
                    let (n, images) = result_size(b.get("content").unwrap_or(&Value::Null));
                    let mut r = Raw::new("results", name, tool_target(input), n);
                    r.fixed = images;
                    r.tool = Some((name.to_string(), ToolPart::Result));
                    if name == "Read" {
                        if let Some(p) = file_arg(input) {
                            r.file = Some((p, false));
                        }
                    }
                    raws.push(r);
                }
                "image" => {
                    let mut r = Raw::new("images", "Image", "Pasted or attached image", 0);
                    r.fixed = image_tokens(b);
                    raws.push(r);
                }
                "tool_addition" => raws.push(Raw::new("tools", "Loaded tool schema", "Deferred tools fetched by ToolSearch", json_chars(b))),
                other => raws.push(Raw::new("other", other.to_string(), "", json_chars(b))),
            }
        }
    }
}

/// Classify a text block: Claude's reply, the user's prompt, or something the
/// harness injected (reminders, hook output, notices).
fn text_raw(role: &str, text: &str) -> Raw {
    let n = chars(text);
    if role == "assistant" {
        return Raw::new("replies", "Reply", snippet(text, 90), n);
    }
    let head: String = text.chars().take(6000).collect();
    let kind = if head.contains("Contents of ") && head.contains("CLAUDE.md") {
        Some("CLAUDE.md & memory")
    } else if head.contains("[SYSTEM NOTIFICATION") || head.contains("<task-notification>") {
        Some("Background task notice")
    } else if head.contains("hook success") || head.contains("hook additional context") || head.contains("<orchestration-hook>") {
        Some("Hook output")
    } else if head.contains("skills are available") {
        Some("Skill list")
    } else if head.contains("Plan mode is active") {
        Some("Plan mode")
    } else if head.contains("<local-command") || head.contains("<command-name>") {
        Some("Command output")
    } else if head.contains("<system-reminder>") {
        Some("System reminder")
    } else if role == "system" {
        Some("Harness message")
    } else {
        None
    };
    match kind {
        Some(kind) => {
            let label = if kind == "Hook output" { hook_name(&head) } else { None };
            Raw::new("reminders", kind, label.unwrap_or_else(|| snippet(text, 90)), n)
        }
        None => Raw::new("prompts", "Prompt", snippet(text, 90), n),
    }
}

/// The first harness message of a session bundles the environment, tool,
/// agent and skill lists, MCP instructions and hook output. Split it at those
/// headings so each part is sized on its own.
fn startup_raws(text: &str) -> Vec<Raw> {
    const SECTIONS: [(&str, &str); 6] = [
        ("# Environment", "Session environment"),
        ("The following tools just became available", "Deferred tool list"),
        ("The following deferred tools", "Deferred tool list"),
        ("Available agent types", "Agent list"),
        ("# MCP Server Instructions", "MCP instructions"),
        ("The following skills are available", "Skill list"),
    ];
    // (byte offset, kind) where each part starts.
    let mut cuts: Vec<(usize, &str)> = Vec::new();
    let mut at = 0;
    for line in text.split_inclusive('\n') {
        let l = line.trim_start();
        let kind = SECTIONS
            .iter()
            .find(|(marker, _)| l.starts_with(marker))
            .map(|&(_, kind)| kind)
            .or_else(|| is_hook_line(l).then_some("Hook output"));
        if let Some(kind) = kind {
            // Consecutive parts of one kind (the two tool lists) stay together;
            // each hook's output is its own part.
            if kind == "Hook output" || cuts.last().map(|c| c.1) != Some(kind) {
                cuts.push((at, kind));
            }
        }
        at += line.len();
    }
    if cuts.first().is_none_or(|c| c.0 > 0) {
        cuts.insert(0, (0, "Session environment"));
    }

    cuts.iter()
        .enumerate()
        .map(|(i, &(start, kind))| {
            let end = cuts.get(i + 1).map_or(text.len(), |c| c.0);
            let part = &text[start..end];
            let bullets = part.lines().filter(|l| l.starts_with("- ")).count();
            let label = match kind {
                "Hook output" => hook_name(part).unwrap_or_else(|| snippet(part, 90)),
                "Skill list" => format!("{} skills", bullets),
                "Agent list" => format!("{} agent types", bullets),
                "Deferred tool list" => "Tool names loadable on demand".to_string(),
                "MCP instructions" => "Instructions from connected MCP servers".to_string(),
                _ => "Working directory, platform, model, date".to_string(),
            };
            Raw::new("reminders", kind, label, chars(part))
        })
        .collect()
}

/// "SessionStart:clear hook success: …" — a hook's name, then the marker.
fn is_hook_line(l: &str) -> bool {
    l.find(" hook success:")
        .or_else(|| l.find(" hook additional context:"))
        .is_some_and(|i| i > 0 && !l[..i].contains(' '))
}

/// "UserPromptSubmit hook success: …" → "UserPromptSubmit".
fn hook_name(text: &str) -> Option<String> {
    let at = text.find(" hook success").or_else(|| text.find(" hook additional context"))?;
    let name = text[..at].rsplit(['\n', '>']).next()?.trim();
    (!name.is_empty() && name.len() < 60).then(|| name.to_string())
}

/// (chars, image tokens) of a tool_result's content.
fn result_size(c: &Value) -> (u64, u64) {
    match c {
        Value::String(s) => (chars(s), 0),
        Value::Array(blocks) => blocks.iter().fold((0, 0), |(n, img), b| {
            match b.get("type").and_then(Value::as_str) {
                Some("text") => (n + str_chars(b, "text"), img),
                Some("image") => (n, img + image_tokens(b)),
                _ => (n + json_chars(b), img),
            }
        }),
        Value::Null => (0, 0),
        other => (json_chars(other), 0),
    }
}

/// Image tokens from a PNG's dimensions (≈ w·h/750 after the API's resize to
/// a 1568px long edge and ~1.15MP); IMAGE_TOKENS when they can't be read.
fn image_tokens(b: &Value) -> u64 {
    let data = b.pointer("/source/data").and_then(Value::as_str).unwrap_or("");
    let bytes = base64_prefix(data, 24);
    if bytes.len() < 24 || &bytes[1..4] != b"PNG" {
        return IMAGE_TOKENS;
    }
    let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]) as f64;
    let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]) as f64;
    if w <= 0.0 || h <= 0.0 {
        return IMAGE_TOKENS;
    }
    let edge = (1568.0 / w.max(h)).min(1.0);
    let (w, h) = (w * edge, h * edge);
    let area = (1_150_000.0 / (w * h)).sqrt().min(1.0);
    ((w * area) * (h * area) / 750.0).ceil().max(1.0) as u64
}

fn base64_prefix(s: &str, n: usize) -> Vec<u8> {
    fn val(c: u8) -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => return None,
        } as u32)
    }
    let mut out = Vec::with_capacity(n);
    let src: Vec<u32> = s.bytes().take(n.div_ceil(3) * 4).map_while(val).collect();
    for q in src.chunks(4) {
        if q.len() < 4 {
            break;
        }
        let v = (q[0] << 18) | (q[1] << 12) | (q[2] << 6) | q[3];
        out.extend_from_slice(&[(v >> 16) as u8, (v >> 8) as u8, v as u8]);
    }
    out.truncate(n);
    out
}

// ---------------------------------------------------------------------------
// Totals

fn finish(raws: Vec<Raw>, reported: Option<u64>) -> ContextBreakdown {
    let fixed: u64 = raws.iter().map(|r| r.fixed).sum();
    let total_chars: u64 = raws.iter().map(|r| r.chars).sum();
    let ratio = match reported {
        Some(t) if total_chars > 0 && t > fixed => (t - fixed) as f64 / total_chars as f64,
        _ => 1.0 / CHARS_PER_TOKEN,
    };
    let total = reported.unwrap_or_else(|| fixed + (total_chars as f64 * ratio) as u64);
    let mut out = finish_with_ratio(raws, total, ratio);
    out.reported = reported.is_some();
    out
}

fn finish_with_ratio(raws: Vec<Raw>, total: u64, ratio: f64) -> ContextBreakdown {
    let tok = |r: &Raw| r.fixed + (r.chars as f64 * ratio).round() as u64;

    let mut groups: HashMap<&'static str, (u64, usize)> = HashMap::new();
    let mut tools: HashMap<String, ToolTotal> = HashMap::new();
    let mut files: HashMap<String, FileTotal> = HashMap::new();
    let mut items: Vec<Item> = Vec::with_capacity(raws.len());

    for r in &raws {
        let t = tok(r);
        let g = groups.entry(r.group).or_default();
        g.0 += t;
        g.1 += 1;
        if let Some((name, part)) = &r.tool {
            let e = tools.entry(name.clone()).or_insert_with(|| ToolTotal { name: name.clone(), ..Default::default() });
            match part {
                ToolPart::Input => { e.calls += 1; e.input_tokens += t; }
                ToolPart::Result => e.result_tokens += t,
            }
        }
        if let Some((path, write)) = &r.file {
            let e = files.entry(path.clone()).or_insert_with(|| FileTotal { path: path.clone(), ..Default::default() });
            if *write { e.writes += 1; e.write_tokens += t; } else { e.reads += 1; e.read_tokens += t; }
        }
        items.push(Item { group: r.group, kind: r.kind.clone(), label: r.label.clone(), tokens: t });
    }

    items.sort_by(|a, b| b.tokens.cmp(&a.tokens));
    items.truncate(MAX_ITEMS);
    let mut tools: Vec<ToolTotal> = tools.into_values().collect();
    tools.sort_by(|a, b| (b.input_tokens + b.result_tokens).cmp(&(a.input_tokens + a.result_tokens)));
    let mut files: Vec<FileTotal> = files.into_values().collect();
    files.sort_by(|a, b| (b.read_tokens + b.write_tokens).cmp(&(a.read_tokens + a.write_tokens)));

    ContextBreakdown {
        source: "request",
        total_tokens: total,
        reported: true,
        groups: GROUPS
            .iter()
            .filter_map(|g| groups.get(g).map(|&(tokens, count)| GroupTotal { group: g, tokens, count }))
            .filter(|g| g.tokens > 0)
            .collect(),
        tools,
        files,
        items,
        ..Default::default()
    }
}

// ---------------------------------------------------------------------------
// Small helpers

fn chars(s: &str) -> u64 {
    s.chars().count() as u64
}

fn str_chars(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(Value::as_str).map(chars).unwrap_or(0)
}

fn json_chars(v: &Value) -> u64 {
    serde_json::to_string(v).map(|s| chars(&s)).unwrap_or(0)
}

fn content_text(c: &Value) -> String {
    match c {
        Value::String(s) => s.clone(),
        Value::Array(a) => a.iter().map(|x| x.get("text").and_then(Value::as_str).map(String::from).unwrap_or_else(|| x.as_str().unwrap_or("").to_string())).collect::<Vec<_>>().join("\n"),
        _ => String::new(),
    }
}

fn file_arg(input: &Value) -> Option<String> {
    ["file_path", "notebook_path", "path"]
        .iter()
        .find_map(|k| input.get(*k)?.as_str())
        .map(String::from)
}

/// What a tool call was about: its path, command, pattern or description.
fn tool_target(input: &Value) -> String {
    const KEYS: [&str; 11] = ["file_path", "notebook_path", "path", "command", "pattern", "description", "query", "url", "skill", "prompt", "intent"];
    KEYS.iter()
        .find_map(|k| input.get(*k)?.as_str())
        .map(|s| snippet(s, 160))
        .unwrap_or_default()
}

/// First meaningful line of `text`, skipping bare tags, cut to `max` chars.
fn snippet(text: &str, max: usize) -> String {
    let line = text
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !(l.starts_with('<') && l.ends_with('>') && !l[1..].contains('<')))
        .unwrap_or("");
    let mut s: String = line.chars().take(max).collect();
    if line.chars().count() > max {
        s.push('…');
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    struct TempSession(PathBuf);
    impl TempSession {
        fn path(&self) -> &Path { &self.0 }
    }
    impl Drop for TempSession {
        fn drop(&mut self) { let _ = std::fs::remove_file(&self.0); }
    }

    fn write_session(lines: &[Value]) -> TempSession {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("lirah-context-test-{}-{}.jsonl", std::process::id(), n));
        let mut f = File::create(&path).unwrap();
        for l in lines {
            writeln!(f, "{}", l).unwrap();
        }
        TempSession(path)
    }

    #[test]
    fn rebuilds_request_and_matches_tool_results() {
        let f = write_session(&[
            serde_json::json!({"type":"api-request-shape","shapeHash":"s1","shape":{"system":[{"type":"text","text":"You are Claude."}],"tools":[{"name":"Read","description":"Reads a file"}]}}),
            serde_json::json!({"type":"api-request-blob","hash":"h1","message":{"role":"user","content":[{"type":"text","text":"read the readme"}]}}),
            serde_json::json!({"type":"api-request","id":"r1","querySource":"repl_main_thread","shapeHash":"s1","tail":["h1"],"params":{"model":"claude-opus-5-5"}}),
            serde_json::json!({"type":"assistant","requestRef":"r1","message":{"usage":{"input_tokens":10}}}),
            serde_json::json!({"type":"api-request-blob","hash":"h2","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/p/README.md"}}]}}),
            serde_json::json!({"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"x".repeat(400)}]}}),
            serde_json::json!({"type":"api-request","id":"r2","querySource":"repl_main_thread","shapeHash":"s1","base":"r1","keep":1,"tail":["h2","missing"],"params":{"model":"claude-opus-5-5"}}),
            serde_json::json!({"type":"assistant","requestRef":"r2","message":{"usage":{"input_tokens":5,"cache_read_input_tokens":195}}}),
        ]);
        let b = breakdown(f.path()).unwrap();
        assert_eq!(b.source, "request");
        assert_eq!(b.total_tokens, 200);
        assert_eq!(b.request_index, 2);
        assert_eq!(b.message_count, 3);
        assert_eq!(b.files.len(), 1);
        assert_eq!(b.files[0].path, "/p/README.md");
        assert_eq!(b.items[0].group, "results");
        let sum: u64 = b.groups.iter().map(|g| g.tokens).sum();
        assert!(sum.abs_diff(200) <= b.items.len() as u64, "groups add up to the reported total");
        assert!(b.groups.iter().any(|g| g.group == "tools"));
        assert!(b.groups.iter().any(|g| g.group == "prompts"));
    }

    #[test]
    fn falls_back_to_transcript_after_last_compaction() {
        let f = write_session(&[
            serde_json::json!({"type":"user","message":{"role":"user","content":"old prompt before compaction"}}),
            serde_json::json!({"type":"system","subtype":"compact_boundary"}),
            serde_json::json!({"type":"user","message":{"role":"user","content":"hello"}}),
            serde_json::json!({"type":"assistant","message":{"role":"assistant","model":"claude-sonnet-5-5","content":[{"type":"text","text":"hi"}],"usage":{"input_tokens":1000}}}),
        ]);
        let b = breakdown(f.path()).unwrap();
        assert_eq!(b.source, "transcript");
        assert_eq!(b.total_tokens, 1000);
        assert_eq!(b.message_count, 2);
        assert!(b.groups.iter().any(|g| g.group == "unlogged" && g.tokens > 900));
        assert!(!b.items.iter().any(|i| i.label.contains("old prompt")));
    }

    #[test]
    fn png_size_from_header() {
        // 1x1 PNG header: width 2000, height 1000 → resized to 1568x784.
        let mut png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, b'I', b'H', b'D', b'R'];
        png.extend_from_slice(&2000u32.to_be_bytes());
        png.extend_from_slice(&1000u32.to_be_bytes());
        const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut b64 = String::new();
        for c in png.chunks(3) {
            let v = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
            for s in [18, 12, 6, 0] {
                b64.push(A[((v >> s) & 63) as usize] as char);
            }
        }
        let t = image_tokens(&serde_json::json!({"source":{"data":b64}}));
        assert!((1500..=1640).contains(&t), "{}", t);
    }

    #[test]
    fn hook_names_and_reminders() {
        assert_eq!(hook_name("UserPromptSubmit hook success: <x>").as_deref(), Some("UserPromptSubmit"));
        assert_eq!(text_raw("user", "<system-reminder>\nContents of /a/CLAUDE.md\n").kind, "CLAUDE.md & memory");
        assert_eq!(text_raw("user", "fix the bug").group, "prompts");
        assert_eq!(text_raw("assistant", "done").group, "replies");
    }

    #[test]
    fn rebuilds_unlogged_assistant_turn_from_records() {
        // Claude's turn answering r1 has no blob, only per-block assistant records.
        let f = write_session(&[
            serde_json::json!({"type":"api-request-blob","hash":"h1","message":{"role":"user","content":"run ls"}}),
            serde_json::json!({"type":"api-request","id":"r1","querySource":"repl_main_thread","tail":["h1"]}),
            serde_json::json!({"type":"assistant","requestRef":"r1","message":{"role":"assistant","content":[{"type":"thinking","thinking":"t".repeat(300),"signature":""}]}}),
            serde_json::json!({"type":"assistant","requestRef":"r1","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}],"usage":{"input_tokens":10}}}),
            serde_json::json!({"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"x".repeat(300)}]}}),
            serde_json::json!({"type":"api-request","id":"r2","querySource":"repl_main_thread","base":"r1","keep":1,"tail":["gone-turn","gone-results"]}),
            serde_json::json!({"type":"assistant","requestRef":"r2","message":{"role":"assistant","content":[],"usage":{"input_tokens":300}}}),
        ]);
        let b = breakdown(f.path()).unwrap();
        assert_eq!(b.message_count, 3);
        assert!(b.groups.iter().any(|g| g.group == "thinking"));
        assert!(b.groups.iter().any(|g| g.group == "calls"));
        assert!(b.groups.iter().any(|g| g.group == "results"));
    }

    #[test]
    fn splits_session_startup_message() {
        let text = "SessionStart:clear hook success: ok\n\n# Environment\ncwd: /p\n\n\
            The following deferred tools are now available via ToolSearch.\nWebFetch\n\n\
            Available agent types for the Agent tool:\n- Explore: search\n- Plan: plan\n\n\
            # MCP Server Instructions\nuse docs\n\n\
            The following skills are available for use with the Skill tool:\n- a: x\n- b: y\n- c: z\n\n\
            UserPromptSubmit hook success: <orchestration-hook>\nprotocol\n";
        let raws = startup_raws(text);
        let kinds: Vec<&str> = raws.iter().map(|r| r.kind.as_str()).collect();
        assert_eq!(kinds, ["Hook output", "Session environment", "Deferred tool list", "Agent list", "MCP instructions", "Skill list", "Hook output"]);
        assert_eq!(raws[0].label, "SessionStart:clear");
        assert_eq!(raws[3].label, "2 agent types");
        assert_eq!(raws[5].label, "3 skills");
        assert_eq!(raws[6].label, "UserPromptSubmit");
        assert_eq!(raws.iter().map(|r| r.chars).sum::<u64>(), chars(text));
    }
}
