//! End to end: the SessionStart command from the generated hooks.json, run with
//! `sh -c`, reaches the real hook_server `serve`/`respond` as a SessionStart event.

use super::*;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::Mutex;

fn has_tool(name: &str) -> bool {
    Command::new("sh")
        .args(["-c", &format!("command -v {name}")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}

#[test]
fn the_session_start_command_delivers_the_hook_json_for_its_session() {
    if !has_tool("sh") || !has_tool("curl") {
        eprintln!("skipped: sh or curl not on PATH");
        return;
    }
    let hooks = crate::agent_hooks::claude_http_hooks();
    let command = hooks["SessionStart"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|g| g["hooks"].as_array().into_iter().flatten())
        .find(|h| h["type"] == "command" && h["command"].as_str().is_some_and(|c| c.contains("curl")))
        .and_then(|h| h["command"].as_str())
        .expect("SessionStart has no curl command hook")
        .to_string();

    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let (tx, rx) = mpsc::channel();
    let tx = Mutex::new(tx);
    let handler = Arc::new(move |r: &Request| {
        respond("tok", r, false, |_, _| None, |s, p| {
            let _ = tx.lock().unwrap().send((s, p));
        })
    });
    thread::spawn(move || serve(listener, REQUEST_DEADLINE, handler));

    let command = command.replace(&HOOK_PORT.to_string(), &port.to_string());
    let mut child = Command::new("sh")
        .args(["-c", &command])
        .env(TOKEN_ENV, "tok")
        .env(crate::agent_hooks::SESSION_ENV, "sess-1")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let body = r#"{"hook_event_name":"SessionStart","source":"clear","session_id":"abc"}"#;
    child.stdin.take().unwrap().write_all(body.as_bytes()).unwrap();

    let (session, payload) = rx.recv_timeout(Duration::from_secs(10)).expect("the listener got no event");
    assert!(child.wait().unwrap().success());
    assert_eq!(session, "sess-1");
    assert_eq!(payload["hook_event_name"], "SessionStart");
    assert_eq!(payload["source"], "clear");
}
