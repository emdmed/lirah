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
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// Fixed loopback port (dynamic range) shared with the `hooks.json` builder.
pub const HOOK_PORT: u16 = 49731;
pub const TOKEN_ENV: &str = "LIRAH_HOOK_TOKEN";
const READ_TIMEOUT: Duration = Duration::from_secs(5);
/// A whole request (headers and body) must arrive within this, so a client
/// that drips bytes cannot hold its thread.
const REQUEST_DEADLINE: Duration = Duration::from_secs(10);
/// Headers are read (and the token checked) only within these limits.
const MAX_HEADER_BYTES: u64 = 16 * 1024;
const MAX_HEADERS: usize = 64;
/// Live connection threads; stalled clients cannot spawn threads without bound.
const MAX_CONNECTIONS: usize = 64;
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
                // Another instance won the race; it may not have written the value yet.
                Err(_) => (0..5).find_map(|_| {
                    let t = fs::read_to_string(&path).ok()?.trim().to_string();
                    if t.is_empty() {
                        thread::sleep(Duration::from_millis(50));
                    }
                    Some(t).filter(|t| !t.is_empty())
                }),
            }
        })
        .as_deref()
}

struct Request {
    token: String,
    session: String,
    body: Vec<u8>,
}

/// A stream whose every read stops at the request's deadline.
struct Deadline<'a> {
    stream: &'a TcpStream,
    end: Instant,
}

impl Read for Deadline<'_> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let left = self.end.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return Err(std::io::ErrorKind::TimedOut.into());
        }
        self.stream.set_read_timeout(Some(left.min(READ_TIMEOUT)))?;
        (&*self.stream).read(buf)
    }
}

fn read_request(stream: &TcpStream, deadline: Duration) -> Option<Request> {
    let mut reader = BufReader::new(Deadline { stream, end: Instant::now() + deadline });
    let (mut token, mut session, mut len) = (String::new(), String::new(), 0usize);
    {
        // Capped, so an unauthenticated client cannot make us buffer headers forever.
        let mut head = (&mut reader).take(MAX_HEADER_BYTES);
        let mut line = String::new();
        head.read_line(&mut line).ok()?; // request line
        for count in 0.. {
            line.clear();
            // Empty read: closed or over the cap before the blank line.
            if head.read_line(&mut line).ok()? == 0 {
                return None;
            }
            let line = line.trim_end();
            if line.is_empty() {
                break;
            }
            if count >= MAX_HEADERS {
                return None;
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

/// Counts a live connection thread; decrements when the thread ends.
struct Live(Arc<AtomicUsize>);

impl Drop for Live {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

/// A thread per connection, so a stalled client blocks no one else; above
/// `MAX_CONNECTIONS` live threads a new connection is closed unanswered.
fn serve(listener: TcpListener, deadline: Duration, handler: Arc<dyn Fn(&Request) -> (u16, Option<Value>) + Send + Sync>) {
    let live = Arc::new(AtomicUsize::new(0));
    for mut stream in listener.incoming().flatten() {
        let handler = handler.clone();
        live.fetch_add(1, Ordering::SeqCst);
        let guard = Live(live.clone());
        if live.load(Ordering::SeqCst) > MAX_CONNECTIONS {
            continue; // guard drops, stream closes
        }
        let _ = thread::Builder::new().name("hook-server-conn".into()).spawn(move || {
            let _guard = guard;
            let _ = stream.set_write_timeout(Some(READ_TIMEOUT));
            let Some(req) = read_request(&stream, deadline) else { return };
            let (status, body) = handler(&req);
            let body = body.map(|b| b.to_string()).unwrap_or_default();
            let content_type = if body.is_empty() { "" } else { "Content-Type: application/json\r\n" };
            let _ = write!(
                stream,
                "HTTP/1.1 {status} X\r\n{content_type}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
        });
    }
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
    let handler = Arc::new(move |req: &Request| {
        respond(token, req, switched_off(), pending_context, |session, payload| {
            crate::agent_hooks::emit_hook(&app, session, payload)
        })
    });
    let _ = thread::Builder::new().name("hook-server".into()).spawn(move || serve(listener, REQUEST_DEADLINE, handler));
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
        let r = read_request(&listener.accept().unwrap().0, REQUEST_DEADLINE).unwrap();
        assert_eq!((r.token.as_str(), r.session.as_str(), r.body.as_slice()), ("tok", "s1", body.as_bytes()));
    }

    /// A server running the real `respond`, on a free port; events are dropped.
    fn spawn_server(deadline: Duration) -> std::net::SocketAddr {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let addr = listener.local_addr().unwrap();
        let handler = Arc::new(|r: &Request| respond("tok", r, false, |_, _| None, |_, _| {}));
        thread::spawn(move || serve(listener, deadline, handler));
        addr
    }

    /// Send `raw`, keep the connection open, and read until the server closes.
    fn exchange(addr: std::net::SocketAddr, raw: &str) -> String {
        let mut c = TcpStream::connect(addr).unwrap();
        c.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        c.write_all(raw.as_bytes()).unwrap();
        let mut out = String::new();
        let _ = c.read_to_string(&mut out);
        out
    }

    const OK_REQ: &str = "POST /hook HTTP/1.1\r\nX-Lirah-Token: tok\r\nX-Lirah-Session: s1\r\nContent-Length: 7\r\n\r\n{\"a\":1}";

    #[test]
    fn a_stalled_client_does_not_block_a_valid_request() {
        let addr = spawn_server(Duration::from_secs(2));
        let mut stalled = TcpStream::connect(addr).unwrap();
        stalled.write_all(b"POST /hook HTTP/1.1\r\nX-Lirah-Tok").unwrap();
        let start = Instant::now();
        let reply = exchange(addr, OK_REQ);
        assert!(reply.starts_with("HTTP/1.1 200"), "{reply}");
        assert!(!reply.contains("Content-Type"), "empty body has no content type");
        assert!(start.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn a_client_that_never_finishes_is_cut_off_at_the_deadline_not_the_read_timeout() {
        let addr = spawn_server(Duration::from_millis(400));
        let start = Instant::now();
        // The read timeout is 5s, so only the total deadline can close this in time.
        assert_eq!(exchange(addr, "POST /hook HTTP/1.1\r\nX-A: 1\r\n"), "");
        assert!(start.elapsed() < Duration::from_secs(3), "took {:?}", start.elapsed());
    }

    #[test]
    fn oversize_content_length_is_refused() {
        let addr = spawn_server(Duration::from_secs(2));
        let raw = format!("POST /hook HTTP/1.1\r\nX-Lirah-Token: tok\r\nContent-Length: {}\r\n\r\n", MAX_BODY + 1);
        assert_eq!(exchange(addr, &raw), "");
    }

    #[test]
    fn too_many_or_too_large_headers_are_refused() {
        let addr = spawn_server(Duration::from_secs(2));
        let many = format!("POST /hook HTTP/1.1\r\n{}\r\n", "X-A: 1\r\n".repeat(MAX_HEADERS + 1));
        assert_eq!(exchange(addr, &many), "");
        let big = format!("POST /hook HTTP/1.1\r\nX-A: {}\r\n\r\n", "a".repeat(MAX_HEADER_BYTES as usize));
        assert_eq!(exchange(addr, &big), "");
    }

    #[test]
    fn exactly_max_headers_is_accepted() {
        let addr = spawn_server(Duration::from_secs(2));
        let raw = format!("POST /hook HTTP/1.1\r\nX-Lirah-Token: tok\r\nX-Lirah-Session: s1\r\nContent-Length: 7\r\n{}\r\n{{\"a\":1}}", "X-A: 1\r\n".repeat(MAX_HEADERS - 3));
        assert!(exchange(addr, &raw).starts_with("HTTP/1.1 200"));
    }

    #[test]
    fn connections_above_the_cap_are_closed_and_slots_free_up() {
        let addr = spawn_server(Duration::from_millis(1500));
        let held: Vec<TcpStream> = (0..MAX_CONNECTIONS).map(|_| TcpStream::connect(addr).unwrap()).collect();
        thread::sleep(Duration::from_millis(300));
        // Over the cap: closed with no reply, even though the request is valid.
        assert_eq!(exchange(addr, OK_REQ), "");
        drop(held);
        thread::sleep(Duration::from_millis(300));
        assert!(exchange(addr, OK_REQ).starts_with("HTTP/1.1 200"));
    }

    #[test]
    fn missing_content_length_is_an_empty_body_not_a_hang() {
        let addr = spawn_server(Duration::from_secs(2));
        let start = Instant::now();
        let reply = exchange(addr, "POST /hook HTTP/1.1\r\nX-Lirah-Token: tok\r\nX-Lirah-Session: s1\r\n\r\n");
        assert!(reply.starts_with("HTTP/1.1 400"), "{reply}");
        assert!(start.elapsed() < Duration::from_secs(1));
    }
}
