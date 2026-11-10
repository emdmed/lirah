//! Loopback HTTP listener for Claude Code `http` hooks: events arrive here
//! instead of through a `node` process per event.
//!
//! Fixed port (the hook `url` cannot take env vars); a second Lirah instance
//! cannot bind it, logs that, and its tabs report to the first instance. The
//! token lives in `~/.lirah/hook-token`, shared by every instance, and must
//! arrive as `X-Lirah-Token`; the terminal is named by `X-Lirah-Session`.
//! Events go out as the same `agent-hook` event the events-dir tailer emits.

use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

/// Fixed loopback port (dynamic range) shared with the `hooks.json` builder.
pub const HOOK_PORT: u16 = 49731;
pub const TOKEN_ENV: &str = "LIRAH_HOOK_TOKEN";
const READ_TIMEOUT: Duration = Duration::from_secs(5);
/// A hook body is one event; anything bigger is refused.
const MAX_BODY: usize = 1024 * 1024;

/// The shared token, created once; None without a home folder.
pub fn token() -> Option<&'static str> {
    static TOKEN: OnceLock<Option<String>> = OnceLock::new();
    TOKEN
        .get_or_init(|| {
            let path = crate::util::lirah_dir()?.join("hook-token");
            let _ = fs::create_dir_all(path.parent()?);
            let fresh = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
            let mut options = fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
            let created = options
                .open(&path)
                .and_then(|mut f| f.write_all(fresh.as_bytes()));
            match created {
                Ok(()) => Some(fresh),
                Err(_) => fs::read_to_string(&path).ok().map(|t| t.trim().to_string()).filter(|t| !t.is_empty()),
            }
        })
        .as_deref()
}

struct Request {
    token: String,
    session: String,
    body: Vec<u8>,
}

fn read_request(stream: TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let (mut token, mut session, mut len) = (String::new(), String::new(), 0usize);
    loop {
        line.clear();
        reader.read_line(&mut line).ok()?;
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        let (name, value) = line.split_once(':')?;
        let value = value.trim();
        match name.to_ascii_lowercase().as_str() {
            "x-lirah-token" => token = value.to_string(),
            "x-lirah-session" => session = value.to_string(),
            "content-length" => len = value.parse().ok()?,
            _ => {}
        }
    }
    if len > MAX_BODY {
        return None;
    }
    let mut body = vec![0; len];
    reader.read_exact(&mut body).ok()?;
    Some(Request { token, session, body })
}

fn squash(s: &str) -> String {
    s.split_whitespace().collect()
}

/// The prompt box's selected context, unless the prompt already carries it.
fn pending_context(session: &str, prompt: Option<&str>) -> Option<String> {
    let text = fs::read_to_string(crate::agent_hooks::prompt_context_path(session)?).ok()?;
    if text.trim().is_empty() || prompt.is_some_and(|p| squash(p).contains(&squash(&text))) {
        return None;
    }
    Some(text)
}

/// Settings -> Agent state hook, read per request so the switch needs no relaunch.
fn switched_off() -> bool {
    crate::util::lirah_dir()
        .and_then(|d| fs::read_to_string(d.join("settings.json")).ok())
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .is_some_and(|s| s["agentStateHook"] == false)
}

/// Status and JSON body (None: empty) for one request. `context` finds a
/// session's pending prompt context; `emit` forwards an event.
fn respond(
    expected: &str,
    req: &Request,
    off: bool,
    context: impl Fn(&str, Option<&str>) -> Option<String>,
    emit: impl Fn(String, Value),
) -> (u16, Option<Value>) {
    if req.token != expected {
        return (401, None);
    }
    let valid = !req.session.is_empty() && req.session.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    let Ok(mut payload) = serde_json::from_slice::<Value>(&req.body) else { return (400, None) };
    if off || !valid {
        return (200, None);
    }
    // Lirah only needs the tool and its input, not file contents or output.
    if let Some(o) = payload.as_object_mut() {
        o.remove("tool_response");
    }
    let mut reply = None;
    if payload["hook_event_name"] == "UserPromptSubmit" {
        if let Some(text) = context(&req.session, payload["prompt"].as_str()) {
            reply = Some(json!({"hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": format!("Context the user selected in Lirah for this prompt:\n\n{text}"),
            }}));
            // Tells Lirah to reset the selection, as after a prompt-box send.
            payload["lirah_context"] = json!(true);
        }
        // Capped so a pasted file doesn't bloat the event.
        if let Some(p) = payload["prompt"].as_str() {
            payload["prompt"] = json!(p.chars().take(2000).collect::<String>());
        }
    }
    emit(req.session.clone(), payload);
    (200, reply)
}

fn handle(app: &AppHandle, expected: &str, mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let _ = stream.set_write_timeout(Some(READ_TIMEOUT));
    let Some(req) = stream.try_clone().ok().and_then(read_request) else { return };
    let (status, body) = respond(
        expected,
        &req,
        switched_off(),
        pending_context,
        |session, payload| crate::agent_hooks::emit_hook(app, session, payload),
    );
    let body = body.map(|b| b.to_string()).unwrap_or_default();
    let _ = write!(
        stream,
        "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

pub fn start(app: AppHandle) {
    let Some(token) = token() else {
        eprintln!("[hook-server] no home folder; HTTP hooks disabled");
        return;
    };
    let listener = match TcpListener::bind((Ipv4Addr::LOCALHOST, HOOK_PORT)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[hook-server] port {HOOK_PORT} unavailable ({e}); another Lirah probably owns it, its tabs get the events");
            return;
        }
    };
    // One connection at a time keeps a terminal's events in order; each is a
    // loopback request that finishes in microseconds (slow clients time out).
    let _ = thread::Builder::new().name("hook-server".into()).spawn(move || {
        for stream in listener.incoming().flatten() {
            handle(&app, token, stream);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn req(token: &str, session: &str, body: &str) -> Request {
        Request { token: token.into(), session: session.into(), body: body.as_bytes().to_vec() }
    }

    fn run(r: &Request, off: bool, ctx: Option<&str>) -> (u16, Option<Value>, Vec<(String, Value)>) {
        let events = RefCell::new(Vec::new());
        let (status, body) = respond("tok", r, off, |_, _| ctx.map(String::from), |s, p| events.borrow_mut().push((s, p)));
        (status, body, events.into_inner())
    }

    #[test]
    fn wrong_token_is_refused_and_emits_nothing() {
        let (status, _, events) = run(&req("bad", "s1", r#"{"hook_event_name":"Stop"}"#), false, None);
        assert_eq!(status, 401);
        assert!(events.is_empty());
    }

    #[test]
    fn event_is_emitted_for_the_header_session_without_tool_response() {
        let body = r#"{"hook_event_name":"PostToolUse","session_id":"x","tool_response":"big"}"#;
        let (status, reply, events) = run(&req("tok", "abc-1", body), false, None);
        assert_eq!((status, reply), (200, None));
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, "abc-1");
        assert!(events[0].1.get("tool_response").is_none());
        assert_eq!(events[0].1["hook_event_name"], "PostToolUse");
    }

    #[test]
    fn bad_session_or_bad_body_emits_nothing() {
        assert!(run(&req("tok", "../x", r#"{"a":1}"#), false, None).2.is_empty());
        assert!(run(&req("tok", "", r#"{"a":1}"#), false, None).2.is_empty());
        assert_eq!(run(&req("tok", "s1", "nope"), false, None).0, 400);
    }

    #[test]
    fn switch_off_answers_empty_and_ignores_the_event() {
        let (status, reply, events) = run(&req("tok", "s1", r#"{"hook_event_name":"Stop"}"#), true, None);
        assert_eq!((status, reply), (200, None));
        assert!(events.is_empty());
    }

    #[test]
    fn prompt_submit_replies_with_context_and_marks_the_event() {
        let body = r#"{"hook_event_name":"UserPromptSubmit","prompt":"hi"}"#;
        let (_, reply, events) = run(&req("tok", "s1", body), false, Some("ctx text"));
        let reply = reply.unwrap();
        assert_eq!(reply["hookSpecificOutput"]["hookEventName"], "UserPromptSubmit");
        assert!(reply["hookSpecificOutput"]["additionalContext"].as_str().unwrap().ends_with("ctx text"));
        assert_eq!(events[0].1["lirah_context"], true);
    }

    #[test]
    fn prompt_submit_without_context_replies_empty_and_caps_the_prompt() {
        let body = json!({"hook_event_name": "UserPromptSubmit", "prompt": "x".repeat(3000)}).to_string();
        let (_, reply, events) = run(&req("tok", "s1", &body), false, None);
        assert!(reply.is_none());
        assert!(events[0].1.get("lirah_context").is_none());
        assert_eq!(events[0].1["prompt"].as_str().unwrap().len(), 2000);
    }

    #[test]
    fn parses_a_real_request_over_tcp() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let addr = listener.local_addr().unwrap();
        let mut client = TcpStream::connect(addr).unwrap();
        let body = r#"{"a":1}"#;
        write!(client, "POST /h HTTP/1.1\r\nX-Lirah-Token: tok\r\nx-lirah-session: s1\r\nContent-Length: {}\r\n\r\n{body}", body.len()).unwrap();
        let r = read_request(listener.accept().unwrap().0).unwrap();
        assert_eq!((r.token.as_str(), r.session.as_str(), r.body.as_slice()), ("tok", "s1", body.as_bytes()));
    }
}
