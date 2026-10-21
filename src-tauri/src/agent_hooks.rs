//! Agent state from the agents' own hooks instead of guesses from terminal output.
//!
//! Every terminal is spawned with `LIRAH_PTY_SESSION` (its session id) and
//! `LIRAH_AGENT_EVENTS` (the events directory). The hooks installed here run
//! inside the agent, so they inherit both. Each one appends the agent's hook
//! payload as a JSON line to `<events dir>/<session id>.jsonl`. The watcher
//! below tails those files and emits `agent-hook` events for the frontend to
//! map onto tab state. Outside Lirah the variables are unset and the hooks
//! exit at once, so a global install is harmless.
//!
//! - Claude Code: a plugin the launcher loads with `--plugin-dir`. Plugin hooks
//!   run alongside the user's own; a `--settings` file would replace their
//!   `hooks` key instead.
//! - opencode: a global plugin that forwards session events the same way.

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const SESSION_ENV: &str = "LIRAH_PTY_SESSION";
pub const EVENTS_ENV: &str = "LIRAH_AGENT_EVENTS";

/// One payload line is a few hundred bytes; anything this large is not a hook
/// payload and is skipped rather than buffered.
const MAX_LINE: usize = 64 * 1024;

const HOOK_SCRIPT: &str = r#"#!/bin/sh
# Lirah agent-state hook. Appends the hook payload (JSON on stdin) to this
# terminal's event log. Does nothing outside a Lirah terminal.
[ -n "$LIRAH_PTY_SESSION" ] && [ -n "$LIRAH_AGENT_EVENTS" ] || exit 0
payload=$(cat | tr -d '\n')
[ -n "$payload" ] || exit 0
# Drop PostToolUse's tool_response (file contents, command output): Lirah only
# needs the tool and its input. Escaped inside strings, the bare key is only
# ever the real one.
key=',"tool_response"'
case $payload in *"$key"*) payload="${payload%%"$key"*}}" ;; esac
printf '%s\n' "$payload" >> "$LIRAH_AGENT_EVENTS/$LIRAH_PTY_SESSION.jsonl"
exit 0
"#;

/// Claude Code hook events that change what a tab should show. PostToolUse
/// feeds the per-turn record of what the agent edited, read and ran.
const CLAUDE_EVENTS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PermissionRequest",
    "Notification",
    "Stop",
    "SessionEnd",
];

const OPENCODE_PLUGIN: &str = r#"// Lirah agent-state plugin (installed by Lirah). Forwards session status to
// the Lirah terminal running this opencode, as Claude-style hook payloads.
// Does nothing outside a Lirah terminal.
import { appendFileSync } from "node:fs";

const session = process.env.LIRAH_PTY_SESSION;
const dir = process.env.LIRAH_AGENT_EVENTS;

// opencode tool names and args, as Claude Code's, so Lirah reads both alike.
const TOOL_NAMES = { edit: "Edit", write: "Write", multiedit: "MultiEdit", patch: "Edit", read: "Read", bash: "Bash" };
function toolPayload(tool, args) {
  return {
    tool_name: TOOL_NAMES[tool] || tool,
    tool_input: { file_path: args?.filePath, command: args?.command },
  };
}
// Args by call id: the after-hook doesn't carry them.
const calls = new Map();

function send(hook_event_name, extra = {}) {
  try {
    appendFileSync(
      `${dir}/${session}.jsonl`,
      JSON.stringify({ hook_event_name, source: "opencode", ...extra }) + "\n",
    );
  } catch {}
}

export const LirahAgentState = async () => {
  if (!session || !dir) return {};
  return {
    "tool.execute.before": async (input, output) => {
      calls.set(input.callID, output?.args);
      send("PreToolUse", toolPayload(input.tool, output?.args));
    },
    "tool.execute.after": async (input) => {
      const args = calls.get(input.callID);
      calls.delete(input.callID);
      send("PostToolUse", toolPayload(input.tool, args));
    },
    event: async ({ event }) => {
      switch (event.type) {
        case "session.status": {
          const status = event.properties?.status?.type;
          if (status === "busy") send("UserPromptSubmit");
          else if (status === "idle") send("Stop");
          break;
        }
        case "session.idle":
          send("Stop");
          break;
        case "permission.updated":
        case "permission.asked":
          send("Notification", {
            notification_type: "permission_prompt",
            message: event.properties?.title,
          });
          break;
        case "permission.replied":
          send("PreToolUse");
          break;
        case "session.error":
          send("Stop", { error: true });
          break;
      }
    },
  };
};
"#;

pub fn events_dir() -> Option<PathBuf> {
    crate::util::lirah_dir().map(|d| d.join("agent-events"))
}

fn claude_plugin_dir() -> Option<PathBuf> {
    crate::util::lirah_dir().map(|d| d.join("claude-plugin"))
}

/// Env vars that tie a terminal's agent hooks to its session.
pub fn session_env(session_id: &str) -> Vec<(String, String)> {
    match events_dir() {
        Some(dir) => vec![
            (SESSION_ENV.to_string(), session_id.to_string()),
            (EVENTS_ENV.to_string(), dir.to_string_lossy().into_owned()),
        ],
        None => Vec::new(),
    }
}

/// Forget a closed terminal's event log.
pub fn remove_session_log(session_id: &str) {
    if let Some(dir) = events_dir() {
        let _ = fs::remove_file(dir.join(format!("{}.jsonl", session_id)));
    }
}

fn write_if_changed(path: &Path, contents: &str) -> std::io::Result<()> {
    if fs::read_to_string(path).ok().as_deref() == Some(contents) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, contents)
}

/// Event logs untouched this long belong to terminals that died without
/// closing (a crash). Live ones are removed when their terminal closes.
const STALE_LOG_AGE: Duration = Duration::from_secs(24 * 60 * 60);

fn prune_stale_logs(events: &Path) {
    let Ok(entries) = fs::read_dir(events) else { return };
    for entry in entries.flatten() {
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|age| age > STALE_LOG_AGE);
        if stale {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Write the hook script, the Claude Code plugin that registers it, and the
/// opencode plugin. Not a wipe of the events directory: another Lirah instance
/// may be using it.
fn install() -> Result<(), String> {
    let lirah = crate::util::lirah_dir().ok_or("No home directory")?;
    let events = lirah.join("agent-events");
    fs::create_dir_all(&events).map_err(|e| e.to_string())?;
    prune_stale_logs(&events);

    let script = lirah.join("hooks").join("agent-state.sh");
    write_if_changed(&script, HOOK_SCRIPT).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&script, fs::Permissions::from_mode(0o755));
    }

    let to_json = |v: serde_json::Value| serde_json::to_string_pretty(&v).map_err(|e| e.to_string());
    let plugin = claude_plugin_dir().ok_or("No home directory")?;
    let manifest = to_json(serde_json::json!({
        "name": "lirah-agent-state",
        "version": "1.0.0",
        "author": { "name": "Lirah" },
        "description": "Reports agent state (working, needs permission, done) to the Lirah terminal running it."
    }))?;
    write_if_changed(&plugin.join(".claude-plugin").join("plugin.json"), &manifest)
        .map_err(|e| e.to_string())?;
    // The script runs in milliseconds; the timeout only bounds a wedged disk.
    let command = serde_json::json!([{ "type": "command", "command": script.to_string_lossy(), "timeout": 5 }]);
    let hooks: serde_json::Map<String, serde_json::Value> = CLAUDE_EVENTS
        .iter()
        .map(|event| (event.to_string(), serde_json::json!([{ "hooks": command }])))
        .collect();
    let hooks_json = to_json(serde_json::json!({ "hooks": hooks }))?;
    write_if_changed(&plugin.join("hooks").join("hooks.json"), &hooks_json)
        .map_err(|e| e.to_string())?;

    // opencode loads every file in its global plugins directory. Only for
    // users who have opencode set up.
    if let Some(config) = crate::util::home_dir().map(|h| h.join(".config").join("opencode")) {
        if config.is_dir() {
            let plugin = config.join("plugins").join("lirah-agent-state.js");
            write_if_changed(&plugin, OPENCODE_PLUGIN).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(serde::Serialize, Clone)]
struct AgentHookEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    payload: serde_json::Value,
}

/// Read whatever complete lines were appended to `path` since `offset`.
fn read_new_lines(path: &Path, offset: &mut u64) -> Vec<serde_json::Value> {
    crate::claude::transcript::read_lines_from(path, offset)
        .into_iter()
        .filter(|line| line.len() <= MAX_LINE)
        .filter_map(|line| serde_json::from_slice(&line).ok())
        .collect()
}

/// Install the hooks and start tailing the events directory. Failures only
/// cost the feature: tabs fall back to guessing from terminal output.
pub fn start(app: AppHandle) {
    if let Err(e) = install() {
        eprintln!("[agent-hooks] install failed: {}", e);
        return;
    }
    let Some(dir) = events_dir() else { return };

    let (tx, rx) = mpsc::channel::<PathBuf>();
    let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        let Ok(event) = res else { return };
        if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
            for path in event.paths {
                let _ = tx.send(path);
            }
        }
    });
    let mut watcher: RecommendedWatcher = match watcher {
        Ok(w) => w,
        Err(e) => {
            eprintln!("[agent-hooks] watcher failed: {}", e);
            return;
        }
    };
    if let Err(e) = watcher.watch(&dir, RecursiveMode::NonRecursive) {
        eprintln!("[agent-hooks] watch failed: {}", e);
        return;
    }

    thread::Builder::new()
        .name("agent-hooks".into())
        .spawn(move || {
            // Owned here so it lives as long as the loop.
            let _watcher = watcher;
            let mut offsets: HashMap<PathBuf, u64> = HashMap::new();
            while let Ok(path) = rx.recv() {
                let Some(session_id) = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .and_then(|n| n.strip_suffix(".jsonl"))
                    .map(str::to_string)
                else {
                    continue;
                };
                if !path.exists() {
                    offsets.remove(&path);
                    continue;
                }
                let offset = offsets.entry(path.clone()).or_insert(0);
                for payload in read_new_lines(&path, offset) {
                    let _ = app.emit(
                        "agent-hook",
                        AgentHookEvent { session_id: session_id.clone(), payload },
                    );
                }
            }
        })
        .expect("failed to start agent-hooks thread");
}

/// The plugin directory the CLI launcher passes to Claude Code with
/// `--plugin-dir`, so its hooks report to Lirah without touching the user's
/// own settings.
#[tauri::command]
pub fn get_agent_hook_plugin_dir() -> Option<String> {
    claude_plugin_dir()
        .filter(|p| p.join("hooks").join("hooks.json").exists())
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn reads_only_complete_new_lines() {
        let dir = std::env::temp_dir().join(format!("lirah-hooks-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("s.jsonl");
        let mut f = File::create(&path).unwrap();
        let mut offset = 0;

        write!(f, "{{\"hook_event_name\":\"Stop\"}}\n{{\"partial\":").unwrap();
        let lines = read_new_lines(&path, &mut offset);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0]["hook_event_name"], "Stop");

        // The partial line completes; garbage lines are skipped.
        write!(f, "1}}\nnot json\n").unwrap();
        let lines = read_new_lines(&path, &mut offset);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0]["partial"], 1);
        assert!(read_new_lines(&path, &mut offset).is_empty());

        // A truncated file is read from the start again.
        File::create(&path).unwrap().write_all(b"{\"n\":2}\n").unwrap();
        assert_eq!(read_new_lines(&path, &mut offset)[0]["n"], 2);
        let _ = fs::remove_dir_all(&dir);
    }
}
