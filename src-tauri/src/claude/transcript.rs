//! Reading JSONL files that agents append to: Claude Code transcripts and
//! subagent logs, and the agent-hook event files. Each consumer keeps its own
//! offset and parses the lines its own way; this only does the file access.

use std::fs::File;
use std::io::{self, BufReader, Read, Seek, SeekFrom};
use std::path::Path;

/// How much of a transcript's tail last_assistant_text reads.
const TRANSCRIPT_TAIL: u64 = 512 * 1024;

/// Whether `path` is a .jsonl file (by extension).
pub fn is_jsonl(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext == "jsonl")
}

/// A buffered reader on `path`, positioned at byte `offset`, for parsing the
/// lines appended since a previous read.
pub fn open_at(path: &Path, offset: u64) -> io::Result<BufReader<File>> {
    let mut reader = BufReader::new(File::open(path)?);
    if offset > 0 {
        reader.seek(SeekFrom::Start(offset))?;
    }
    Ok(reader)
}

/// The complete, non-empty lines appended to `path` since `*offset`, which is
/// advanced past them. A partial last line is left for the next read; a file
/// shorter than `*offset` (truncated or replaced) is read from the start.
pub fn read_lines_from(path: &Path, offset: &mut u64) -> Vec<Vec<u8>> {
    let Ok(mut file) = File::open(path) else { return Vec::new() };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    if len < *offset {
        *offset = 0; // Truncated or replaced.
    }
    if len == *offset || file.seek(SeekFrom::Start(*offset)).is_err() {
        return Vec::new();
    }
    let mut buf = Vec::new();
    if file.take(len - *offset).read_to_end(&mut buf).is_err() {
        return Vec::new();
    }
    let Some(end) = buf.iter().rposition(|b| *b == b'\n') else { return Vec::new() };
    *offset += end as u64 + 1;
    buf[..end]
        .split(|b| *b == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| line.to_vec())
        .collect()
}

/// The text of the newest assistant message in a Claude Code transcript, from
/// its tail only; None when there is no text there.
/// The last `TRANSCRIPT_TAIL` bytes of a transcript. It can start mid-line;
/// that first line won't parse as JSON and callers skip it.
fn read_tail(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Transcript not found: {}", e))?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(TRANSCRIPT_TAIL))).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// When the newest message was the user interrupting (Esc), as its ISO
/// timestamp. Claude Code fires no Stop hook on an interrupt, so this is how
/// a tab learns its turn ended. `None` when the newest message is anything else.
pub fn last_interrupt_at(path: &Path) -> Result<Option<String>, String> {
    let text = read_tail(path)?;
    for line in text.lines().rev() {
        let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let kind = entry.get("type").and_then(|t| t.as_str());
        if kind != Some("user") && kind != Some("assistant") {
            continue; // bookkeeping lines (last-prompt, cost-state, ...)
        }
        let content = entry.pointer("/message/content");
        let first_text = match content {
            Some(serde_json::Value::String(s)) => Some(s.as_str()),
            Some(serde_json::Value::Array(blocks)) => blocks
                .iter()
                .find(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
                .and_then(|b| b.get("text").and_then(|t| t.as_str())),
            _ => None,
        };
        let interrupted = kind == Some("user")
            && first_text.is_some_and(|t| t.starts_with("[Request interrupted by user"));
        return Ok(if interrupted {
            entry.get("timestamp").and_then(|t| t.as_str()).map(String::from)
        } else {
            None
        });
    }
    Ok(None)
}

pub fn last_assistant_text(path: &Path) -> Result<Option<String>, String> {
    let text = read_tail(path)?;
    for line in text.lines().rev() {
        let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        if entry.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }
        let Some(blocks) = entry.pointer("/message/content").and_then(|c| c.as_array()) else {
            continue;
        };
        let parts: Vec<&str> = blocks
            .iter()
            .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
            .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
            .collect();
        // Tool-use-only entries carry no text; keep looking further back.
        if !parts.is_empty() {
            return Ok(Some(parts.join("\n")));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transcript(name: &str, lines: &[&str]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("lirah-transcript-{}-{name}.jsonl", std::process::id()));
        std::fs::write(&path, lines.join("\n") + "\n").unwrap();
        path
    }

    #[test]
    fn interrupt_is_found_past_bookkeeping_lines() {
        let path = transcript("interrupted", &[
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"working on it"}]},"timestamp":"2026-11-08T10:00:00.000Z"}"#,
            r#"{"type":"user","message":{"content":[{"type":"text","text":"[Request interrupted by user for tool use]"}]},"timestamp":"2026-11-08T10:00:05.000Z"}"#,
            r#"{"type":"last-prompt","lastPrompt":"x"}"#,
        ]);
        assert_eq!(last_interrupt_at(&path).unwrap().as_deref(), Some("2026-11-08T10:00:05.000Z"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn a_later_message_hides_an_old_interrupt() {
        let path = transcript("resumed", &[
            r#"{"type":"user","message":{"content":[{"type":"text","text":"[Request interrupted by user]"}]},"timestamp":"2026-11-08T10:00:05.000Z"}"#,
            r#"{"type":"user","message":{"content":"try again"},"timestamp":"2026-11-08T10:01:00.000Z"}"#,
        ]);
        assert_eq!(last_interrupt_at(&path).unwrap(), None);
        let _ = std::fs::remove_file(path);
    }
}
