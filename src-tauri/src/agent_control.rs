//! Control socket for the `lirah` CLI: lets the agent in a tab configure Lirah.
//!
//! The app listens on `~/.lirah/control/<pid>.sock`. A client writes one JSON
//! line `{session, cmd, args}` and reads one JSON line back, `{ok, data}` or
//! `{ok: false, error}`. The server doesn't act on requests itself: it emits an
//! `agent-control` event `{id, sessionId, cmd, args}` to the frontend, which
//! applies the command and answers through `agent_control_reply`. A request the
//! frontend doesn't answer within `REPLY_TIMEOUT` gets an error reply.
//!
//! One socket per process, so a dev build and an installed app can run side by
//! side; sockets left by processes that are gone are removed at startup.

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const REPLY_TIMEOUT: Duration = Duration::from_secs(60);
/// A client that connects but never finishes its request line is dropped.
const READ_TIMEOUT: Duration = Duration::from_secs(10);
/// Requests are small JSON objects; anything bigger is refused.
const MAX_REQUEST: u64 = 1024 * 1024;

#[derive(Deserialize)]
struct Request {
    #[serde(default)]
    session: Option<String>,
    cmd: String,
    #[serde(default)]
    args: Value,
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn pending() -> &'static Mutex<HashMap<u64, Sender<Value>>> {
    static PENDING: OnceLock<Mutex<HashMap<u64, Sender<Value>>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn control_dir() -> Option<PathBuf> {
    crate::util::lirah_dir().map(|d| d.join("control"))
}

/// This process's control socket path. Tabs get it in their environment so the
/// CLI talks to the app that owns the tab.
pub fn socket_path() -> Option<PathBuf> {
    control_dir().map(|d| d.join(format!("{}.sock", std::process::id())))
}

fn pid_alive(pid: u32) -> bool {
    if cfg!(target_os = "linux") {
        Path::new(&format!("/proc/{pid}")).exists()
    } else {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(true)
    }
}

/// Remove sockets whose owning process is gone.
fn remove_stale_sockets(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let own = std::process::id();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("sock") {
            continue;
        }
        let Some(pid) = path
            .file_stem()
            .and_then(|s| s.to_str())
            .and_then(|s| s.parse::<u32>().ok())
        else {
            continue;
        };
        if pid != own && !pid_alive(pid) {
            let _ = fs::remove_file(&path);
        }
    }
}

/// Bind the control socket and serve it on a background thread.
pub fn start(app: AppHandle) {
    let (Some(dir), Some(path)) = (control_dir(), socket_path()) else {
        eprintln!("[agent_control] no home folder; control socket disabled");
        return;
    };
    if let Err(e) = fs::create_dir_all(&dir) {
        eprintln!("[agent_control] can't create {}: {e}", dir.display());
        return;
    }
    remove_stale_sockets(&dir);
    // A leftover file under our own pid (pid reuse) would make bind fail.
    let _ = fs::remove_file(&path);
    let listener = match UnixListener::bind(&path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[agent_control] can't bind {}: {e}", path.display());
            return;
        }
    };
    thread::Builder::new()
        .name("agent-control".into())
        .spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else { continue };
                let app = app.clone();
                // Each request waits up to a minute for the frontend, so each
                // gets its own thread rather than holding up the next.
                let _ = thread::Builder::new()
                    .name("agent-control-conn".into())
                    .spawn(move || handle(app, stream));
            }
        })
        .ok();
}

/// Remove this process's socket. Called when the app exits.
pub fn stop() {
    if let Some(path) = socket_path() {
        let _ = fs::remove_file(path);
    }
}

fn handle(app: AppHandle, stream: UnixStream) {
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let reply = match read_request(&stream) {
        Ok(req) => relay(&app, req),
        Err(e) => json!({ "ok": false, "error": e }),
    };
    let mut stream = stream;
    let mut line = reply.to_string();
    line.push('\n');
    let _ = stream.write_all(line.as_bytes());
    let _ = stream.flush();
}

fn read_request(stream: &UnixStream) -> Result<Request, String> {
    let mut reader = BufReader::new(stream.take(MAX_REQUEST));
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|e| format!("couldn't read request: {e}"))?;
    if line.trim().is_empty() {
        return Err("empty request".into());
    }
    serde_json::from_str(line.trim()).map_err(|e| format!("bad request: {e}"))
}

fn relay(app: &AppHandle, req: Request) -> Value {
    // Answered here so `lirah ping` checks the socket without the frontend.
    if req.cmd == "ping" {
        return json!({ "ok": true, "data": "pong" });
    }
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    pending().lock().unwrap_or_else(|e| e.into_inner()).insert(id, tx);

    let event = json!({
        "id": id,
        "sessionId": req.session,
        "cmd": req.cmd,
        "args": req.args,
    });
    if let Err(e) = app.emit("agent-control", event) {
        take_pending(id);
        return json!({ "ok": false, "error": format!("couldn't reach Lirah: {e}") });
    }

    match rx.recv_timeout(REPLY_TIMEOUT) {
        Ok(reply) => reply,
        Err(_) => {
            take_pending(id);
            json!({ "ok": false, "error": "Lirah didn't answer" })
        }
    }
}

fn take_pending(id: u64) -> Option<Sender<Value>> {
    pending().lock().unwrap_or_else(|e| e.into_inner()).remove(&id)
}

/// The frontend's answer to an `agent-control` event.
#[tauri::command]
pub fn agent_control_reply(
    id: u64,
    ok: bool,
    data: Option<Value>,
    error: Option<String>,
) -> Result<(), String> {
    let Some(tx) = take_pending(id) else {
        // Timed out already, or answered twice.
        return Ok(());
    };
    let reply = if ok {
        json!({ "ok": true, "data": data.unwrap_or(Value::Null) })
    } else {
        json!({ "ok": false, "error": error.unwrap_or_else(|| "command failed".into()) })
    };
    let _ = tx.send(reply);
    Ok(())
}
