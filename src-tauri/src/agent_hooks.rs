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
//!
//! The same Claude Code hook also carries the prompt box's selected context
//! (files, elements, repos, template, patterns) into prompts typed straight
//! into the terminal: the frontend mirrors it to
//! `<prompt context dir>/<session id>.md` and the hook adds that file to the
//! prompt on UserPromptSubmit.

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
pub const PROMPT_CONTEXT_ENV: &str = "LIRAH_PROMPT_CONTEXT";

/// One payload line is a few hundred bytes; anything this large is not a hook
/// payload and is skipped rather than buffered.
const MAX_LINE: usize = 64 * 1024;

const HOOK_JS: &str = include_str!("agent_state_hook.js");
// The hook is an ES module; this makes Node load it as one on any version.
const HOOKS_PACKAGE_JSON: &str = "{\"type\":\"module\"}\n";

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

fn prompt_context_dir() -> Option<PathBuf> {
    crate::util::lirah_dir().map(|d| d.join("prompt-context"))
}

fn claude_plugin_dir() -> Option<PathBuf> {
    crate::util::lirah_dir().map(|d| d.join("claude-plugin"))
}

/// Env vars that tie a terminal's agent hooks to its session.
pub fn session_env(session_id: &str) -> Vec<(String, String)> {
    match (events_dir(), prompt_context_dir()) {
        (Some(dir), Some(context)) => vec![
            (SESSION_ENV.to_string(), session_id.to_string()),
            (EVENTS_ENV.to_string(), dir.to_string_lossy().into_owned()),
            (PROMPT_CONTEXT_ENV.to_string(), context.to_string_lossy().into_owned()),
        ],
        _ => Vec::new(),
    }
}

/// Forget a closed terminal's event log and pending prompt context.
pub fn remove_session_log(session_id: &str) {
    if let Some(dir) = events_dir() {
        let _ = fs::remove_file(dir.join(format!("{}.jsonl", session_id)));
    }
    if let Some(path) = prompt_context_path(session_id) {
        let _ = fs::remove_file(path);
    }
}

/// Session ids are UUIDs; anything else must not become a path.
fn prompt_context_path(session_id: &str) -> Option<PathBuf> {
    let valid = !session_id.is_empty()
        && session_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !valid {
        return None;
    }
    prompt_context_dir().map(|d| d.join(format!("{}.md", session_id)))
}

/// Mirror the prompt box's selected context for this terminal, so the
/// Claude Code hook can add it to a prompt typed in the terminal. Empty text
/// removes it.
#[tauri::command]
pub async fn set_prompt_context(session_id: String, text: String) -> Result<(), String> {
    crate::ipc::blocking("set_prompt_context", move || {
        let path = prompt_context_path(&session_id).ok_or("Invalid session id")?;
        if text.trim().is_empty() {
            return match fs::remove_file(&path) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
                _ => Ok(()),
            };
        }
        write_if_changed(&path, &text).map_err(|e| e.to_string())
    })
    .await
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

/// Write the hook script and the Claude Code plugin that registers it. The
/// opencode plugin follows the setting (set_opencode_agent_plugin). Not a
/// wipe of the events directory: another Lirah instance may be using it.
fn install() -> Result<(), String> {
    let lirah = crate::util::lirah_dir().ok_or("No home directory")?;
    let events = lirah.join("agent-events");
    fs::create_dir_all(&events).map_err(|e| e.to_string())?;
    prune_stale_logs(&events);
    let context = lirah.join("prompt-context");
    fs::create_dir_all(&context).map_err(|e| e.to_string())?;
    prune_stale_logs(&context);

    let hooks_dir = lirah.join("hooks");
    let script = hooks_dir.join("agent-state.js");
    write_if_changed(&script, HOOK_JS).map_err(|e| e.to_string())?;
    write_if_changed(&hooks_dir.join("package.json"), HOOKS_PACKAGE_JSON).map_err(|e| e.to_string())?;
    // Left by builds that shipped the hook as a shell script.
    let _ = fs::remove_file(hooks_dir.join("agent-state.sh"));

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
    let command = serde_json::json!([{ "type": "command", "command": crate::util::node_command(&script), "timeout": 5 }]);
    let hooks: serde_json::Map<String, serde_json::Value> = CLAUDE_EVENTS
        .iter()
        .map(|event| (event.to_string(), serde_json::json!([{ "hooks": command }])))
        .collect();
    let hooks_json = to_json(serde_json::json!({ "hooks": hooks }))?;
    write_if_changed(&plugin.join("hooks").join("hooks.json"), &hooks_json)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// opencode loads every file in its global plugins directory, so unlike the
/// Claude Code plugin it can't be left out per launch: the setting installs or
/// removes it. Only for users who have opencode set up.
fn opencode_plugin_path() -> Option<PathBuf> {
    crate::util::home_dir()
        .map(|h| h.join(".config").join("opencode"))
        .filter(|config| config.is_dir())
        .map(|config| config.join("plugins").join("lirah-agent-state.js"))
}

/// Install or remove the opencode agent-state plugin (the "Agent state hook"
/// setting). Claude Code needs no call: the launcher just leaves its plugin out.
#[tauri::command]
pub async fn set_opencode_agent_plugin(enabled: bool) -> Result<(), String> {
    crate::ipc::blocking("set_opencode_agent_plugin", move || {
        let Some(plugin) = opencode_plugin_path() else { return Ok(()) };
        if enabled {
            write_if_changed(&plugin, OPENCODE_PLUGIN).map_err(|e| e.to_string())
        } else {
            match fs::remove_file(&plugin) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
                _ => Ok(()),
            }
        }
    })
    .await
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
    use std::process::{Command, Stdio};

    #[test]
    fn hook_logs_payload_without_tool_response() {
        if Command::new("node").arg("--version").output().is_err() {
            return; // no Node on this machine
        }
        let dir = std::env::temp_dir().join(format!("lirah-hook-js-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("hook.js"), HOOK_JS).unwrap();
        fs::write(dir.join("package.json"), HOOKS_PACKAGE_JSON).unwrap();
        let run = |session: Option<&str>| {
            let mut cmd = Command::new("node");
            cmd.arg(dir.join("hook.js")).env(EVENTS_ENV, &dir).env_remove(SESSION_ENV).stdin(Stdio::piped());
            if let Some(s) = session { cmd.env(SESSION_ENV, s); }
            let mut child = cmd.spawn().unwrap();
            child.stdin.take().unwrap()
                .write_all(b"{\"hook_event_name\":\"PostToolUse\",\n\"tool_name\":\"Read\",\"tool_response\":{\"content\":\"big\"}}")
                .unwrap();
            assert!(child.wait().unwrap().success());
        };

        run(None);
        assert!(!dir.join("s1.jsonl").exists());

        run(Some("s1"));
        let log = fs::read_to_string(dir.join("s1.jsonl")).unwrap();
        assert_eq!(log, "{\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Read\"}\n");
        let _ = fs::remove_dir_all(&dir);
    }

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
