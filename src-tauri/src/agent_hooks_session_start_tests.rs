//! Claude Code 2.1.322 never runs `http` hooks for SessionStart, so that one
//! event is a `command` hook that curls the same hook_server; the rest stay http.

use super::*;
use serde_json::{json, Value};

/// Every hook of `event`, across all its matcher groups.
fn hooks_of<'a>(hooks: &'a Value, event: &str) -> Vec<&'a Value> {
    hooks[event].as_array().into_iter().flatten().flat_map(|g| g["hooks"].as_array().into_iter().flatten()).collect()
}

/// The curl command hook of SessionStart.
fn curl_hook(hooks: &Value) -> &Value {
    hooks_of(hooks, "SessionStart")
        .into_iter()
        .find(|h| h["type"] == "command" && h["command"].as_str().is_some_and(|c| c.contains("curl")))
        .expect("SessionStart has no curl command hook")
}

#[test]
fn session_start_is_a_curl_command_hook_to_the_hook_server() {
    let hooks = claude_http_hooks();
    let hook = curl_hook(&hooks);
    let cmd = hook["command"].as_str().unwrap();
    assert!(cmd.contains(&format!("http://127.0.0.1:{}/hook", crate::hook_server::HOOK_PORT)), "{cmd}");
    assert!(cmd.contains("X-Lirah-Token: $LIRAH_HOOK_TOKEN"), "{cmd}");
    assert!(cmd.contains("X-Lirah-Session: $LIRAH_PTY_SESSION"), "{cmd}");
    assert!(cmd.contains("--data-binary @-"), "{cmd}");
    assert!(cmd.contains("-X POST"), "{cmd}");
    assert!(hook["timeout"].as_u64().is_some_and(|t| t > 0), "needs a timeout");
}

#[test]
fn the_other_events_stay_http_hooks() {
    let hooks = claude_http_hooks();
    assert_eq!(hooks.as_object().unwrap().len(), CLAUDE_EVENTS.len());
    for event in CLAUDE_EVENTS.iter().filter(|e| **e != "SessionStart") {
        let hook = &hooks[*event][0]["hooks"][0];
        assert_eq!(hook["type"], "http", "{event}");
        assert_eq!(hook["headers"]["X-Lirah-Token"], "$LIRAH_HOOK_TOKEN");
        assert_eq!(hook["headers"]["X-Lirah-Session"], "$LIRAH_PTY_SESSION");
    }
    assert!(hooks_of(&hooks, "SessionStart").iter().all(|h| h["type"] != "http"), "SessionStart must not be http");
}

#[test]
fn compaction_hooks_are_kept_next_to_the_session_start_curl_hook() {
    let mut hooks = serde_json::Map::new();
    merge_hooks(&mut hooks, claude_http_hooks());
    merge_hooks(&mut hooks, json!({
        "SessionStart": [{ "hooks": [{ "type": "command", "command": "node hook.js --session-start", "timeout": 10 }] }],
        "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node hook.js", "timeout": 15 }] }],
        "PreToolUse": [{ "matcher": "Read", "hooks": [{ "type": "command", "command": "node guard.js", "timeout": 10 }] }],
    }));
    let hooks = Value::Object(hooks);
    let cmds: Vec<&str> = hooks_of(&hooks, "SessionStart").iter().filter_map(|h| h["command"].as_str()).collect();
    assert!(cmds.iter().any(|c| c.contains("curl")), "{cmds:?}");
    assert!(cmds.contains(&"node hook.js --session-start"), "{cmds:?}");
    for (event, cmd) in [("UserPromptSubmit", "node hook.js"), ("PreToolUse", "node guard.js")] {
        assert!(hooks_of(&hooks, event).iter().any(|h| h["command"] == cmd), "{event}");
        assert!(hooks_of(&hooks, event).iter().any(|h| h["type"] == "http"), "{event} keeps its http hook");
    }
}
