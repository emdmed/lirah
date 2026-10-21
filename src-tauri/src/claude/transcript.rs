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
pub fn last_assistant_text(path: &Path) -> Result<Option<String>, String> {
    let mut file = File::open(path).map_err(|e| format!("Transcript not found: {}", e))?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    let start = len.saturating_sub(TRANSCRIPT_TAIL);
    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&buf);
    // A tail read can start mid-line; that first line won't parse and is skipped.
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
