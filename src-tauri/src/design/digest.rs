//! Build a compact, design-oriented digest of a Claude Code session transcript.
//!
//! A raw session `.jsonl` is routinely multiple megabytes, and `tool_result`
//! bodies (file contents, command output) dominate it. For turning a
//! conversation into a design diagram we want the *reasoning* plus the *shape of
//! the work*, not the raw evidence. So this keeps:
//!
//!   - all user and assistant text,
//!   - the name of every tool call and the file path it targeted,
//!
//! and drops every `tool_result` body and every thinking block. The file paths
//! are also collected separately as `files_touched` — the strongest grounding
//! signal available for deciding which parts of a design already exist.
//!
//! Digesting here rather than in the webview means a huge transcript is never
//! serialized across the Tauri bridge.

use serde::Serialize;
use std::io::{BufRead, BufReader};

/// Floor for the per-message text cap, so one pasted stack trace or file dump
/// cannot crowd out the rest of the conversation. The real cap scales with the
/// budget — see `msg_cap`.
const MAX_MSG_CHARS: usize = 6_000;

/// Default digest budget. Roughly 175k tokens — large enough that a long design
/// conversation survives whole, and still a fraction of the extractor's context
/// so it has room to go and read the repo.
const DEFAULT_MAX_CHARS: usize = 700_000;

/// The per-message cap for a given budget. A raised budget has to lift the
/// per-message cut too, or asking for the full conversation still returns every
/// long turn chopped at the same place.
fn msg_cap(budget: usize) -> usize {
    (budget / 40).max(MAX_MSG_CHARS)
}

/// Cap on how many distinct file paths we report; beyond this the list stops
/// being useful grounding and starts being noise.
const MAX_FILES_TOUCHED: usize = 200;

/// How many of those paths get listed in the digest header.
const FILES_IN_HEADER: usize = 60;

#[derive(Debug, Clone, Serialize)]
pub struct SessionDigest {
    pub digest: String,
    pub message_count: usize,
    pub tool_use_count: usize,
    pub chars: usize,
    /// True when older messages were dropped to fit the budget.
    pub truncated: bool,
    /// Distinct repo-relative-ish paths seen in tool calls, in first-seen order.
    pub files_touched: Vec<String>,
}

/// Truncate to a character budget on a char boundary, appending an ellipsis
/// marker when anything was cut.
fn clip(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let kept: String = text.chars().take(max).collect();
    format!("{}\n… [{} chars omitted]", kept, text.chars().count() - max)
}

/// Pull the most identifying argument out of a tool call — usually a file path.
/// Falls back to a short slice of the command for Bash, or the pattern for
/// search tools, so the digest still says *what* the call was about.
fn tool_target(input: Option<&serde_json::Value>) -> Option<String> {
    let input = input?;
    for key in ["file_path", "path", "notebook_path", "pattern", "url"] {
        if let Some(v) = input.get(key).and_then(|v| v.as_str()) {
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    if let Some(cmd) = input.get("command").and_then(|v| v.as_str()) {
        let first_line = cmd.lines().next().unwrap_or(cmd);
        return Some(clip(first_line, 80));
    }
    if let Some(desc) = input.get("description").and_then(|v| v.as_str()) {
        return Some(clip(desc, 80));
    }
    None
}

/// True for tool arguments that look like a filesystem path rather than a
/// command or a search pattern. Used to build `files_touched`.
fn looks_like_path(s: &str) -> bool {
    s.contains('/') && !s.contains(' ') && !s.starts_with('-')
}

/// Tool calls record absolute paths, but the spec asks for repo-relative ones —
/// and absolute paths bloat the digest badly (40 of them fill 4KB on one line).
/// So strip the project root wherever it appears.
fn relativize(path: &str, root: Option<&str>) -> String {
    match root {
        Some(root) => {
            let root = root.trim_end_matches('/');
            path.strip_prefix(&format!("{}/", root))
                .unwrap_or(path)
                .to_string()
        }
        None => path.to_string(),
    }
}

/// Tag-wrapped blocks the CLI injects into the user turn. None of it is
/// conversation: it is slash-command plumbing, caveats the harness adds, and
/// captured command output. Left in, a `/clear` invocation reads as if the user
/// said "/clear" and the extractor tries to make sense of it.
const NOISE_TAGS: [&str; 7] = [
    "local-command-caveat",
    "local-command-stdout",
    "local-command-stderr",
    "command-name",
    "command-message",
    "command-args",
    "system-reminder",
];

/// Remove every `<tag>…</tag>` block for the noise tags above. Unclosed tags are
/// cut to the end of the text — a truncated block is noise either way.
fn strip_harness_noise(text: &str) -> String {
    let mut out = text.to_string();
    for tag in NOISE_TAGS {
        let open = format!("<{}>", tag);
        let close = format!("</{}>", tag);
        loop {
            let Some(start) = out.find(&open) else { break };
            let end = match out[start..].find(&close) {
                Some(offset) => start + offset + close.len(),
                None => out.len(),
            };
            out.replace_range(start..end, "");
        }
    }
    out.trim().to_string()
}

/// Extract the text of a user message. `content` is a bare string for typed
/// prompts and an array of blocks when the turn carries tool results — in the
/// array case only `text` blocks are kept, so tool_result bodies are dropped.
fn user_text(message: &serde_json::Value) -> String {
    match message.get("content") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(blocks)) => {
            let texts: Vec<&str> = blocks
                .iter()
                .filter(|b| b.get("type").and_then(|t| t.as_str()) != Some("tool_result"))
                .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                .filter(|t| !t.trim().is_empty())
                .collect();
            texts.join("\n\n")
        }
        _ => String::new(),
    }
}

/// Build a digest of the session transcript at `session_path`.
///
/// `max_chars` bounds the returned digest; when the transcript exceeds it the
/// *oldest* messages are dropped, except the very first user message — the
/// original ask is almost always the most useful single turn for a design.
///
/// `project_path`, when given, is stripped from file paths so the digest speaks
/// in repo-relative terms — the same terms the spec asks the extractor to use.
/// Declared `async` on purpose: Tauri runs synchronous commands on the main
/// thread, which on Linux is the GTK/WebKit UI thread. Parsing a multi-megabyte
/// transcript there freezes the whole window. `async` moves it onto the async
/// runtime instead. The body stays blocking — it is short (~20ms on a 3MB
/// session) and file IO on the runtime is acceptable at this size.
#[tauri::command]
pub async fn build_session_digest(
    session_path: String,
    max_chars: Option<usize>,
    project_path: Option<String>,
) -> Result<SessionDigest, String> {
    let budget = max_chars.unwrap_or(DEFAULT_MAX_CHARS).max(4_000);
    let root = project_path.as_deref();

    let file = std::fs::File::open(&session_path)
        .map_err(|e| format!("Failed to open session file {}: {}", session_path, e))?;
    let reader = BufReader::new(file);

    // One rendered block per conversational turn, in order.
    let mut blocks: Vec<String> = Vec::new();
    let mut tool_use_count = 0usize;
    let mut files_touched: Vec<String> = Vec::new();
    let mut seen_files = std::collections::HashSet::new();

    for line in reader.lines().map_while(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }
        let json: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        // Sidechain entries are subagent transcripts interleaved into the file;
        // they describe delegated work, not the design conversation.
        if json.get("isSidechain").and_then(|v| v.as_bool()) == Some(true) {
            continue;
        }
        let msg_type = match json.get("type").and_then(|v| v.as_str()) {
            Some(t) => t,
            None => continue,
        };
        let message = match json.get("message") {
            Some(m) => m,
            None => continue,
        };

        match msg_type {
            "user" => {
                let text = strip_harness_noise(&user_text(message));
                if text.trim().is_empty() {
                    // Pure tool_result turn, or nothing but harness plumbing.
                    continue;
                }
                blocks.push(format!("## user\n{}", clip(text.trim(), msg_cap(budget))));
            }
            "assistant" => {
                let content = message.get("content").and_then(|v| v.as_array());
                let mut texts: Vec<String> = Vec::new();
                let mut tools: Vec<String> = Vec::new();

                if let Some(content_blocks) = content {
                    for block in content_blocks {
                        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match block_type {
                            // Thinking is deliberately excluded — it is long and
                            // its conclusions already appear in the text blocks.
                            "thinking" | "redacted_thinking" => {}
                            "tool_use" => {
                                tool_use_count += 1;
                                let name =
                                    block.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                                match tool_target(block.get("input")).map(|t| {
                                    if looks_like_path(&t) {
                                        relativize(&t, root)
                                    } else {
                                        t
                                    }
                                }) {
                                    Some(target) => {
                                        if looks_like_path(&target)
                                            && files_touched.len() < MAX_FILES_TOUCHED
                                            && seen_files.insert(target.clone())
                                        {
                                            files_touched.push(target.clone());
                                        }
                                        tools.push(format!("{}({})", name, target));
                                    }
                                    None => tools.push(name.to_string()),
                                }
                            }
                            _ => {
                                if let Some(t) = block.get("text").and_then(|t| t.as_str()) {
                                    if !t.trim().is_empty() {
                                        texts.push(t.to_string());
                                    }
                                }
                            }
                        }
                    }
                } else if let Some(s) = message.get("content").and_then(|v| v.as_str()) {
                    texts.push(s.to_string());
                }

                if texts.is_empty() && tools.is_empty() {
                    continue;
                }
                let mut rendered = String::from("## assistant\n");
                if !texts.is_empty() {
                    rendered.push_str(&clip(texts.join("\n\n").trim(), msg_cap(budget)));
                    rendered.push('\n');
                }
                if !tools.is_empty() {
                    rendered.push_str(&format!("tools: {}\n", tools.join(", ")));
                }
                blocks.push(rendered.trim_end().to_string());
            }
            _ => {}
        }
    }

    let message_count = blocks.len();

    // Fit to budget: always keep the opening ask, then take the most recent
    // turns backwards until the budget is spent.
    let total: usize = blocks.iter().map(|b| b.len() + 2).sum();
    let (kept, truncated) = if total <= budget || blocks.len() <= 1 {
        (blocks.clone(), false)
    } else {
        let first = blocks[0].clone();
        let mut used = first.len() + 2;
        let mut tail: Vec<String> = Vec::new();
        for block in blocks[1..].iter().rev() {
            let cost = block.len() + 2;
            if used + cost > budget {
                break;
            }
            used += cost;
            tail.push(block.clone());
        }
        tail.reverse();
        let omitted = blocks.len() - 1 - tail.len();
        let mut kept = vec![first];
        if omitted > 0 {
            kept.push(format!("## [{} earlier messages omitted]", omitted));
        }
        kept.extend(tail);
        (kept, omitted > 0)
    };

    let mut digest = String::new();
    digest.push_str(&format!(
        "# Conversation digest\nmessages: {}\ntool calls: {}\n",
        message_count, tool_use_count
    ));
    if !files_touched.is_empty() {
        // One path per line: a single comma-joined line runs to thousands of
        // characters on a long session and reads as noise.
        digest.push_str("files touched:\n");
        for path in files_touched.iter().take(FILES_IN_HEADER) {
            digest.push_str(&format!("  {}\n", path));
        }
        if files_touched.len() > FILES_IN_HEADER {
            digest.push_str(&format!(
                "  … and {} more\n",
                files_touched.len() - FILES_IN_HEADER
            ));
        }
    }
    if truncated {
        digest.push_str("note: older messages were omitted to fit the budget\n");
    }
    digest.push('\n');
    digest.push_str(&kept.join("\n\n"));

    let chars = digest.len();
    Ok(SessionDigest {
        digest,
        message_count,
        tool_use_count,
        chars,
        truncated,
        files_touched,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Write a `.jsonl` of the given lines to a temp file and digest it.
    fn digest_of(name: &str, lines: &[&str], max_chars: Option<usize>) -> SessionDigest {
        digest_of_in(name, lines, max_chars, None)
    }

    /// As `digest_of`, but with a project root to relativize paths against.
    fn digest_of_in(
        name: &str,
        lines: &[&str],
        max_chars: Option<usize>,
        project_path: Option<&str>,
    ) -> SessionDigest {
        // Tests run in parallel in one process, so the name must be unique per test.
        let path = std::env::temp_dir().join(format!(
            "lirah-digest-test-{}-{}.jsonl",
            std::process::id(),
            name
        ));
        let mut f = std::fs::File::create(&path).unwrap();
        for line in lines {
            writeln!(f, "{}", line).unwrap();
        }
        drop(f);
        let result = tauri::async_runtime::block_on(build_session_digest(
            path.to_string_lossy().to_string(),
            max_chars,
            project_path.map(|p| p.to_string()),
        ))
        .unwrap();
        let _ = std::fs::remove_file(&path);
        result
    }

    #[test]
    fn keeps_user_and_assistant_text() {
        let d = digest_of("keeps-text", 
            &[
                r#"{"type":"user","message":{"role":"user","content":"design me a diagram"}}"#,
                r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"here is the plan"}]}}"#,
            ],
            None,
        );
        assert!(d.digest.contains("design me a diagram"));
        assert!(d.digest.contains("here is the plan"));
        assert_eq!(d.message_count, 2);
        assert!(!d.truncated);
    }

    #[test]
    fn drops_tool_result_bodies_but_keeps_the_turn_out_of_the_way() {
        let d = digest_of("drops-results", 
            &[
                r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"SECRET_FILE_BODY"}]}}"#,
                r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"more body"},{"type":"text","text":"and my follow-up"}]}}"#,
            ],
            None,
        );
        assert!(!d.digest.contains("SECRET_FILE_BODY"), "tool_result body leaked");
        assert!(!d.digest.contains("more body"), "tool_result body leaked");
        assert!(d.digest.contains("and my follow-up"));
        // The pure tool_result turn carries nothing for a design, so it is skipped.
        assert_eq!(d.message_count, 1);
    }

    #[test]
    fn drops_thinking_blocks() {
        let d = digest_of("drops-thinking", 
            &[r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"LONG_INTERNAL_MONOLOGUE"},{"type":"text","text":"the answer"}]}}"#],
            None,
        );
        assert!(!d.digest.contains("LONG_INTERNAL_MONOLOGUE"));
        assert!(d.digest.contains("the answer"));
    }

    #[test]
    fn records_tool_calls_and_file_paths() {
        let d = digest_of("records-tools", 
            &[
                r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"reading"},{"type":"tool_use","name":"Read","input":{"file_path":"src/features/design/spec.js"}},{"type":"tool_use","name":"Bash","input":{"command":"cargo check --all"}}]}}"#,
                r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Read","input":{"file_path":"src/features/design/spec.js"}}]}}"#,
            ],
            None,
        );
        assert!(d.digest.contains("Read(src/features/design/spec.js)"));
        assert!(d.digest.contains("Bash(cargo check --all)"));
        assert_eq!(d.tool_use_count, 3);
        // Paths are deduped; a shell command is not a path.
        assert_eq!(d.files_touched, vec!["src/features/design/spec.js".to_string()]);
    }

    #[test]
    fn strips_slash_command_and_harness_plumbing() {
        let d = digest_of(
            "noise",
            &[
                r#"{"type":"user","message":{"role":"user","content":"<local-command-caveat>Caveat: the messages below were generated while running local commands.</local-command-caveat>"}}"#,
                r#"{"type":"user","message":{"role":"user","content":"<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>"}}"#,
                r#"{"type":"user","message":{"role":"user","content":"<system-reminder>ignore me</system-reminder>real design question<system-reminder>and me</system-reminder>"}}"#,
            ],
            None,
        );
        // Turns 1 and 2 are pure plumbing and vanish; turn 3 keeps its real text.
        assert_eq!(d.message_count, 1, "digest was:\n{}", d.digest);
        assert!(d.digest.contains("real design question"));
        assert!(!d.digest.contains("Caveat"));
        assert!(!d.digest.contains("/clear"));
        assert!(!d.digest.contains("ignore me"));
        assert!(!d.digest.contains("and me"));
    }

    #[test]
    fn unclosed_noise_tag_does_not_hang_or_leak() {
        let d = digest_of(
            "noise-unclosed",
            &[r#"{"type":"user","message":{"role":"user","content":"keep this<system-reminder>truncated forever"}}"#],
            None,
        );
        assert!(d.digest.contains("keep this"));
        assert!(!d.digest.contains("truncated forever"));
    }

    #[test]
    fn relativizes_paths_against_the_project_root() {
        let line = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Read","input":{"file_path":"/home/me/repo/src/app.js"}},{"type":"tool_use","name":"Read","input":{"file_path":"/elsewhere/other.js"}}]}}"#;
        let d = digest_of_in("relativize", &[line], None, Some("/home/me/repo"));
        assert_eq!(
            d.files_touched,
            vec!["src/app.js".to_string(), "/elsewhere/other.js".to_string()],
            "root should be stripped, unrelated absolute paths left alone"
        );
        assert!(d.digest.contains("Read(src/app.js)"));
        // A trailing slash on the root must not change the result.
        let d2 = digest_of_in("relativize-slash", &[line], None, Some("/home/me/repo/"));
        assert_eq!(d2.files_touched[0], "src/app.js");
    }

    #[test]
    fn files_touched_header_is_one_path_per_line_and_capped() {
        let lines: Vec<String> = (0..FILES_IN_HEADER + 5)
            .map(|i| format!(
                r#"{{"type":"assistant","message":{{"role":"assistant","content":[{{"type":"tool_use","name":"Read","input":{{"file_path":"src/f{}.js"}}}}]}}}}"#,
                i
            ))
            .collect();
        let refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();
        let d = digest_of("header-cap", &refs, None);
        assert_eq!(d.files_touched.len(), FILES_IN_HEADER + 5);
        assert!(d.digest.contains("  src/f0.js\n"), "paths should be one per line");
        assert!(d.digest.contains("… and 5 more"));
        assert!(!d.digest.contains("src/f60.js\n  src"), "header should stop at the cap");
    }

    #[test]
    fn tool_only_assistant_turn_is_kept() {
        let d = digest_of("tool-only", 
            &[r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Grep","input":{"pattern":"layoutDesign"}}]}}"#],
            None,
        );
        assert_eq!(d.message_count, 1);
        assert!(d.digest.contains("Grep(layoutDesign)"));
    }

    #[test]
    fn skips_sidechain_entries() {
        let d = digest_of("sidechain", 
            &[
                r#"{"type":"user","isSidechain":true,"message":{"role":"user","content":"SUBAGENT_TASK"}}"#,
                r#"{"type":"user","message":{"role":"user","content":"main thread ask"}}"#,
            ],
            None,
        );
        assert!(!d.digest.contains("SUBAGENT_TASK"));
        assert_eq!(d.message_count, 1);
    }

    #[test]
    fn survives_malformed_and_blank_lines() {
        let d = digest_of("malformed", 
            &[
                "",
                "not json at all",
                r#"{"type":"summary","summary":"no message field"}"#,
                r#"{"type":"user","message":{"role":"user","content":"still here"}}"#,
            ],
            None,
        );
        assert_eq!(d.message_count, 1);
        assert!(d.digest.contains("still here"));
    }

    #[test]
    fn truncation_keeps_the_opening_ask_and_the_tail() {
        let mut lines = vec![r#"{"type":"user","message":{"role":"user","content":"THE ORIGINAL ASK"}}"#.to_string()];
        for i in 0..80 {
            lines.push(format!(
                r#"{{"type":"assistant","message":{{"role":"assistant","content":[{{"type":"text","text":"filler message number {} {}"}}]}}}}"#,
                i,
                "x".repeat(400)
            ));
        }
        lines.push(
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"THE LATEST TURN"}]}}"#
                .to_string(),
        );
        let refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();

        let d = digest_of("truncation", &refs, Some(6_000));
        assert!(d.truncated);
        assert!(d.digest.contains("THE ORIGINAL ASK"), "opening ask was dropped");
        assert!(d.digest.contains("THE LATEST TURN"), "most recent turn was dropped");
        assert!(d.digest.contains("earlier messages omitted"));
        // message_count reports the true conversation length, not what survived.
        assert_eq!(d.message_count, 82);
        // The budget is a budget: allow the header and markers some slack.
        assert!(d.chars < 8_000, "digest was {} chars", d.chars);
    }

    #[test]
    fn per_message_cap_limits_one_giant_paste() {
        let huge = "y".repeat(500_000);
        let line = format!(
            r#"{{"type":"user","message":{{"role":"user","content":"{}"}}}}"#,
            huge
        );
        let d = digest_of("per-msg-cap", &[&line], None);
        assert!(
            d.chars < msg_cap(DEFAULT_MAX_CHARS) + 2_000,
            "one message expanded to {} chars",
            d.chars
        );
        assert!(d.digest.contains("chars omitted"));
    }

    /// The cap scales with the budget, but never below the floor — a caller who
    /// asks for a small digest still gets whole short messages in it.
    #[test]
    fn the_per_message_cap_follows_the_budget() {
        assert_eq!(msg_cap(DEFAULT_MAX_CHARS), DEFAULT_MAX_CHARS / 40);
        assert_eq!(msg_cap(4_000), MAX_MSG_CHARS);
        assert!(msg_cap(2_000_000) > msg_cap(DEFAULT_MAX_CHARS));
    }
}
