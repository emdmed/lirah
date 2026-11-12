//! Agent state from the agents' own hooks instead of guesses from terminal output.
//!
//! Every terminal is spawned with `LIRAH_PTY_SESSION` (its session id),
//! `LIRAH_HOOK_TOKEN` and `LIRAH_AGENT_EVENTS` (the events directory).
//!
//! - Claude Code: a plugin the launcher loads with `--plugin-dir` registers
//!   `http` hooks that post each event to `hook_server` (which also carries the
//!   prompt box's selected context back on UserPromptSubmit). Plugin hooks run
//!   alongside the user's own; a `--settings` file would replace their `hooks`
//!   key instead.
//! - opencode: a global plugin appends events as JSON lines to
//!   `<events dir>/<session id>.jsonl`; the watcher below tails those files.
//!
//! Both end as `agent-hook` events for the frontend to map onto tab state. The
//! prompt box mirrors its context to `<prompt context dir>/<session id>.md`.

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
pub const CONTROL_ENV: &str = "LIRAH_CONTROL";
pub const WORKSPACE_ENV: &str = "LIRAH_WORKSPACE";

/// One payload line is a few hundred bytes; anything this large is not a hook
/// payload and is skipped rather than buffered.
const MAX_LINE: usize = 64 * 1024;

// The CLI is an ES module; this makes Node load it as one on any version.
const HOOKS_PACKAGE_JSON: &str = "{\"type\":\"module\"}\n";
/// The `lirah` CLI (an ES module, so its folder gets the same package.json)
/// and the sh wrapper that puts it on PATH as `lirah`.
const LIRAH_CLI_JS: &str = include_str!("lirah_cli.js");
const LIRAH_FILES_JS: &str = include_str!("lirah_files.js");
const LIRAH_SKILL_MD: &str = include_str!("lirah_skill.md");
const LIRAH_WRAPPER: &str = "#!/bin/sh\nexec node \"$(dirname \"$0\")/lirah.js\" \"$@\"\n";
#[cfg(windows)]
const LIRAH_CMD_WRAPPER: &str = "@node \"%~dp0lirah.js\" %*\r\n";

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

fn cli_bin_dir() -> Option<PathBuf> {
    crate::util::lirah_dir().map(|d| d.join("bin"))
}

/// Env vars that tie a terminal's agent hooks to its session, point the
/// `lirah` CLI at this app's control socket, and put the CLI on PATH. The
/// sandbox clears the environment, so these reach it only through here.
pub fn session_env(session_id: &str) -> Vec<(String, String)> {
    let (Some(dir), Some(context)) = (events_dir(), prompt_context_dir()) else {
        return Vec::new();
    };
    let mut env = vec![
        (SESSION_ENV.to_string(), session_id.to_string()),
        (EVENTS_ENV.to_string(), dir.to_string_lossy().into_owned()),
        (PROMPT_CONTEXT_ENV.to_string(), context.to_string_lossy().into_owned()),
    ];
    if let Some(token) = crate::hook_server::token() {
        env.push((crate::hook_server::TOKEN_ENV.to_string(), token.to_string()));
    }
    if let Some(sock) = crate::agent_control::socket_path() {
        env.push((CONTROL_ENV.to_string(), sock.to_string_lossy().into_owned()));
    }
    if let Some(bin) = cli_bin_dir() {
        let rest = std::env::var_os("PATH").unwrap_or_default();
        let dirs = std::iter::once(bin.clone())
            .chain(std::env::split_paths(&rest).filter(|p| !p.as_os_str().is_empty()));
        let path = std::env::join_paths(dirs).unwrap_or_else(|_| bin.into_os_string());
        env.push(("PATH".to_string(), path.to_string_lossy().into_owned()));
    }
    env
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
pub(crate) fn prompt_context_path(session_id: &str) -> Option<PathBuf> {
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

/// Write the `lirah` CLI and the Claude Code plugin manifest. The
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

    // Left by builds that ran agent-state.js as a command hook; Claude Code now posts to hook_server.
    let _ = fs::remove_dir_all(lirah.join("hooks"));

    install_cli(&lirah.join("bin")).map_err(|e| e.to_string())?;

    // Left by builds that shipped the skill as a plugin of its own.
    let _ = fs::remove_dir_all(lirah.join("control").join("claude-plugin"));

    let plugin = claude_plugin_dir().ok_or("No home directory")?;
    let manifest = serde_json::to_string_pretty(&serde_json::json!({
        "name": "lirah",
        "version": "1.0.0",
        "author": { "name": "Lirah" },
        "description": "Lirah's hooks and skill: agent state, project compaction and the lirah command."
    }))
    .map_err(|e| e.to_string())?;
    write_if_changed(&plugin.join(".claude-plugin").join("plugin.json"), &manifest)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// The `lirah` CLI: `bin/lirah` runs `bin/lirah.js` with node.
fn install_cli(bin: &Path) -> std::io::Result<()> {
    write_if_changed(&bin.join("lirah.js"), LIRAH_CLI_JS)?;
    write_if_changed(&bin.join("lirah_files.js"), LIRAH_FILES_JS)?;
    write_if_changed(&bin.join("package.json"), HOOKS_PACKAGE_JSON)?;
    let wrapper = bin.join("lirah");
    write_if_changed(&wrapper, LIRAH_WRAPPER)?;
    #[cfg(windows)]
    write_if_changed(&bin.join("lirah.cmd"), LIRAH_CMD_WRAPPER)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755))?;
    }
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

/// Hand a hook event to the frontend (shared by the tailer and the HTTP listener).
pub fn emit_hook(app: &AppHandle, session_id: String, payload: serde_json::Value) {
    let _ = app.emit("agent-hook", AgentHookEvent { session_id, payload });
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
                    emit_hook(&app, session_id.clone(), payload);
                }
            }
        })
        .expect("failed to start agent-hooks thread");
}

/// Fold `add` (event -> matcher groups) into `hooks`, keeping both sides' groups.
fn merge_hooks(hooks: &mut serde_json::Map<String, serde_json::Value>, add: serde_json::Value) {
    let serde_json::Value::Object(add) = add else { return };
    for (event, groups) in add {
        let serde_json::Value::Array(groups) = groups else { continue };
        if let serde_json::Value::Array(list) = hooks.entry(event).or_insert_with(|| serde_json::json!([])) {
            list.extend(groups);
        }
    }
}

/// The agent-state events as `http` hooks to hook_server: token and session go
/// as headers from the terminal's env (the `url` cannot take env vars).
pub(crate) fn claude_http_hooks() -> serde_json::Value {
    let hook = serde_json::json!([{ "hooks": [{
        "type": "http",
        "url": format!("http://127.0.0.1:{}/hook", crate::hook_server::HOOK_PORT),
        "timeout": 5,
        "headers": { "X-Lirah-Token": format!("${}", crate::hook_server::TOKEN_ENV), "X-Lirah-Session": format!("${SESSION_ENV}") },
        "allowedEnvVars": [crate::hook_server::TOKEN_ENV, SESSION_ENV],
    }] }]);
    let mut hooks: serde_json::Map<String, serde_json::Value> =
        CLAUDE_EVENTS.iter().map(|e| (e.to_string(), hook.clone())).collect();
    // Claude Code 2.1.322 never runs http hooks for SessionStart, so that one is a
    // command hook posting its stdin (the hook JSON) to the same listener. The
    // shell expands the env vars; the quoting works in sh and Git Bash.
    let curl = format!(
        "curl -s -m 3 -X POST -H \"Content-Type: application/json\" -H \"X-Lirah-Token: ${}\" -H \"X-Lirah-Session: ${SESSION_ENV}\" --data-binary @- http://127.0.0.1:{}/hook",
        crate::hook_server::TOKEN_ENV,
        crate::hook_server::HOOK_PORT
    );
    hooks.insert("SessionStart".into(), serde_json::json!([{ "hooks": [{ "type": "command", "command": curl, "timeout": 5 }] }]));
    serde_json::Value::Object(hooks)
}

/// Compose Lirah's one Claude Code plugin (~/.lirah/claude-plugin) and return
/// its directory, or None when nothing is installed. Every hook is always in;
/// each script reads its own switch (agentStateHook, compactionHook) from
/// settings.json per call. The skill is no hook, so `agent_control` decides at
/// launch whether it is in.
fn write_base_plugin(agent_control: bool) -> Result<Option<String>, String> {
    let plugin = claude_plugin_dir().ok_or("No home directory")?;
    if !plugin.join(".claude-plugin").join("plugin.json").exists() {
        return Ok(None); // startup install failed
    }
    let mut hooks = serde_json::Map::new();
    merge_hooks(&mut hooks, claude_http_hooks());
    if let Some(add) = crate::compaction::claude_hooks() {
        merge_hooks(&mut hooks, add);
    }
    let skill = plugin.join("skills").join("lirah").join("SKILL.md");
    if agent_control {
        write_if_changed(&skill, LIRAH_SKILL_MD).map_err(|e| e.to_string())?;
    } else {
        let _ = fs::remove_dir_all(plugin.join("skills"));
    }
    let hooks_json = serde_json::to_string_pretty(&serde_json::json!({ "hooks": hooks })).map_err(|e| e.to_string())?;
    let path = plugin.join("hooks").join("hooks.json");
    if fs::read_to_string(&path).ok().as_deref() != Some(hooks_json.as_str()) {
        fs::create_dir_all(plugin.join("hooks")).map_err(|e| e.to_string())?;
        // Renamed into place so an agent starting at the same moment never reads half a file.
        let tmp = plugin.join("hooks").join(format!(".hooks.json.{}", std::process::id()));
        fs::write(&tmp, &hooks_json).and_then(|_| fs::rename(&tmp, &path)).map_err(|e| e.to_string())?;
    }
    Ok((!hooks.is_empty() || agent_control).then(|| plugin.to_string_lossy().into_owned()))
}

/// The base plugin directory the CLI launcher passes to Claude Code with one
/// `--plugin-dir`, so Lirah's hooks and skill load without touching the
/// user's own settings.
#[tauri::command]
pub async fn install_base_plugin(agent_control: bool) -> Result<Option<String>, String> {
    crate::ipc::blocking("install_base_plugin", move || write_base_plugin(agent_control)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn merge_hooks_keeps_every_part_of_a_shared_event() {
        let mut hooks = serde_json::Map::new();
        merge_hooks(&mut hooks, serde_json::json!({ "UserPromptSubmit": [{ "hooks": [1] }], "Stop": [{ "hooks": [2] }] }));
        merge_hooks(&mut hooks, serde_json::json!({ "UserPromptSubmit": [{ "hooks": [3] }] }));
        assert_eq!(hooks["UserPromptSubmit"].as_array().unwrap().len(), 2);
        assert_eq!(hooks["Stop"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn claude_events_are_http_hooks_with_token_and_session_headers() {
        let hooks = claude_http_hooks();
        assert_eq!(hooks.as_object().unwrap().len(), CLAUDE_EVENTS.len());
        for event in CLAUDE_EVENTS.iter().filter(|e| **e != "SessionStart") {
            let hook = &hooks[*event][0]["hooks"][0];
            assert_eq!(hook["type"], "http");
            assert_eq!(hook["url"], format!("http://127.0.0.1:{}/hook", crate::hook_server::HOOK_PORT));
            assert_eq!(hook["headers"]["X-Lirah-Token"], "$LIRAH_HOOK_TOKEN");
            assert_eq!(hook["headers"]["X-Lirah-Session"], "$LIRAH_PTY_SESSION");
            assert_eq!(hook["allowedEnvVars"], serde_json::json!(["LIRAH_HOOK_TOKEN", "LIRAH_PTY_SESSION"]));
            assert!(hook.get("onFailure").is_none());
        }
    }

    #[test]
    fn install_cli_writes_the_wrappers() {
        let bin = std::env::temp_dir().join(format!("lirah-cli-bin-{}", std::process::id()));
        install_cli(&bin).unwrap();
        assert_eq!(
            fs::read_to_string(bin.join("lirah")).unwrap(),
            "#!/bin/sh\nexec node \"$(dirname \"$0\")/lirah.js\" \"$@\"\n"
        );
        // cmd needs CRLF line ends
        assert_eq!(bin.join("lirah.cmd").exists(), cfg!(windows));
        #[cfg(windows)]
        assert_eq!(fs::read_to_string(bin.join("lirah.cmd")).unwrap(), "@node \"%~dp0lirah.js\" %*\r\n");
        let _ = fs::remove_dir_all(&bin);
    }

    #[test]
    fn path_starts_with_bin_then_original_entries() {
        let env = session_env("s1");
        let (_, path) = env.iter().find(|(k, _)| k == "PATH").expect("session_env sets PATH");
        let got: Vec<_> = std::env::split_paths(path).collect();
        assert_eq!(got[0], cli_bin_dir().unwrap());
        let original = std::env::var_os("PATH").unwrap_or_default();
        let rest: Vec<_> = std::env::split_paths(&original).filter(|p| !p.as_os_str().is_empty()).collect();
        assert_eq!(got[1..], rest[..]);
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

#[cfg(test)]
#[path = "agent_hooks_session_start_tests.rs"]
mod session_start_tests;
