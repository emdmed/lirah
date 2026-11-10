//! Control socket for the `lirah` CLI: lets the agent in a tab configure Lirah.
//!
//! The app listens on `~/.lirah/control/<pid>.sock` (a Unix socket), or on the
//! named pipe `\\.\pipe\lirah-control-<pid>` on Windows. A client writes one JSON
//! line `{session, cmd, args}` and reads one JSON line back, `{ok, data}` or
//! `{ok: false, error}`. The server doesn't act on requests itself: it emits an
//! `agent-control` event `{id, sessionId, cmd, args}` to the frontend, which
//! applies the command and answers through `agent_control_reply`. A request the
//! frontend doesn't answer within `REPLY_TIMEOUT` gets an error reply.
//!
//! One socket or pipe per process, so a dev build and an installed app can run
//! side by side. Sockets left by processes that are gone are removed at
//! startup; a pipe vanishes with its process.

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
#[cfg(unix)]
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
#[cfg(unix)]
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

#[cfg(unix)]
fn control_dir() -> Option<PathBuf> {
    crate::util::lirah_dir().map(|d| d.join("control"))
}

/// This process's control socket path (a pipe name on Windows). Tabs get it in
/// their environment so the CLI talks to the app that owns the tab.
#[cfg(unix)]
pub fn socket_path() -> Option<PathBuf> {
    control_dir().map(|d| d.join(format!("{}.sock", std::process::id())))
}

#[cfg(windows)]
pub fn socket_path() -> Option<PathBuf> {
    Some(PathBuf::from(format!(r"\\.\pipe\lirah-control-{}", std::process::id())))
}

#[cfg(unix)]
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
#[cfg(unix)]
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
#[cfg(unix)]
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

/// Remove this process's socket. Called when the app exits. A pipe goes away
/// with the process.
pub fn stop() {
    #[cfg(unix)]
    if let Some(path) = socket_path() {
        let _ = fs::remove_file(path);
    }
}

/// Listen on this process's named pipe and serve it on a background thread.
#[cfg(windows)]
pub fn start(app: AppHandle) {
    let Some(path) = socket_path() else { return };
    match listen(&path) {
        Ok(listener) => serve(listener, READ_TIMEOUT, move |event| app.emit("agent-control", event)),
        Err(e) => eprintln!("[agent_control] can't listen on {}: {e}", path.display()),
    }
}

/// Refuses remote clients (interprocess' default for pipes). Trust model: default DACL (same user and admins full control, others read-only), same trust level as the Unix socket; the sandbox is off on Windows.
#[cfg(windows)]
fn listen(path: &Path) -> std::io::Result<interprocess::local_socket::Listener> {
    use interprocess::local_socket::{prelude::*, GenericFilePath, ListenerOptions};
    ListenerOptions::new().name(path.to_fs_name::<GenericFilePath>()?).create_sync()
}

/// `emit` hands a request to the frontend (the `agent-control` event).
#[cfg(windows)]
fn serve(
    listener: interprocess::local_socket::Listener,
    read_timeout: Duration,
    emit: impl Fn(Value) -> tauri::Result<()> + Clone + Send + 'static,
) {
    use interprocess::local_socket::traits::ListenerExt as _;
    thread::Builder::new()
        .name("agent-control".into())
        .spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else { continue };
                let emit = emit.clone();
                let _ = thread::Builder::new()
                    .name("agent-control-conn".into())
                    .spawn(move || handle(stream, read_timeout, &emit));
            }
        })
        .ok();
}

#[cfg(unix)]
fn handle(app: AppHandle, stream: UnixStream) {
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let reply = answer(&|event| app.emit("agent-control", event), read_request(&stream));
    write_reply(&stream, reply);
}

/// Pipes have no read timeout: the request is read on a helper thread, and a
/// read still pending at the deadline is cancelled so the thread and the pipe
/// instance are freed.
#[cfg(windows)]
fn handle(
    stream: interprocess::local_socket::Stream,
    read_timeout: Duration,
    emit: &dyn Fn(Value) -> tauri::Result<()>,
) {
    use std::os::windows::io::{AsHandle, AsRawHandle};
    let stream = std::sync::Arc::new(stream);
    let (tx, rx) = mpsc::channel();
    let reader = stream.clone();
    let _ = thread::Builder::new()
        .name("agent-control-read".into())
        .spawn(move || {
            let _ = tx.send(read_request(&*reader));
        });
    let request = rx.recv_timeout(read_timeout).unwrap_or_else(|_| {
        let interprocess::local_socket::Stream::NamedPipe(pipe) = &*stream;
        // SAFETY: the handle lives as long as `stream`; a cancel with no
        // pending I/O is harmless.
        let _ = unsafe {
            windows::Win32::System::IO::CancelIoEx(
                windows::Win32::Foundation::HANDLE(pipe.as_handle().as_raw_handle()),
                None,
            )
        };
        Err("timed out reading request".into())
    });
    write_reply(&*stream, answer(emit, request));
}

fn answer(emit: &dyn Fn(Value) -> tauri::Result<()>, request: Result<Request, String>) -> Value {
    match request {
        Ok(req) => relay(emit, req),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

fn write_reply(mut out: impl Write, reply: Value) {
    let mut line = reply.to_string();
    line.push('\n');
    let _ = out.write_all(line.as_bytes());
    let _ = out.flush();
}

fn read_request(stream: impl Read) -> Result<Request, String> {
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

fn relay(emit: &dyn Fn(Value) -> tauri::Result<()>, req: Request) -> Value {
    // Answered here so `lirah ping` checks the socket without the frontend.
    if req.cmd == "ping" {
        return json!({ "ok": true, "data": "pong" });
    }
    // The QA driver clicks and types in the UI: only for instances launched for QA.
    if (req.cmd == "qa" || req.cmd.starts_with("qa.")) && std::env::var_os("LIRAH_QA").is_none() {
        return json!({ "ok": false, "error": "qa commands need an instance started with LIRAH_QA=1 (npm run qa)" });
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
    if let Err(e) = emit(event) {
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

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use interprocess::local_socket::{prelude::*, GenericFilePath, Stream};

    /// A server on its own pipe whose frontend never answers.
    fn server(name: &str) -> PathBuf {
        server_with(name, READ_TIMEOUT, |_| Ok(()))
    }

    fn server_with(
        name: &str,
        read_timeout: Duration,
        emit: impl Fn(Value) -> tauri::Result<()> + Clone + Send + 'static,
    ) -> PathBuf {
        let path = PathBuf::from(format!(r"\\.\pipe\lirah-control-test-{}-{name}", std::process::id()));
        serve(listen(&path).unwrap(), read_timeout, emit);
        path
    }

    fn ask(path: &Path, request: &str) -> Value {
        let stream = Stream::connect(path.to_fs_name::<GenericFilePath>().unwrap()).unwrap();
        (&stream).write_all(request.as_bytes()).unwrap();
        let mut reply = String::new();
        BufReader::new(&stream).read_line(&mut reply).unwrap();
        serde_json::from_str(&reply).unwrap()
    }

    #[test]
    fn ping_round_trip_over_the_pipe() {
        let path = server("ping");
        assert_eq!(ask(&path, "{\"cmd\":\"ping\"}
"), json!({ "ok": true, "data": "pong" }));
    }

    #[test]
    fn request_that_is_not_json_gets_an_error_reply() {
        let path = server("garbage");
        let reply = ask(&path, "not json
");
        assert_eq!(reply["ok"], false);
        assert!(reply["error"].as_str().unwrap().starts_with("bad request"), "{reply}");
    }

    #[test]
    fn client_that_sends_nothing_is_answered_then_closed() {
        let path = server_with("silent", Duration::from_millis(300), |_| Ok(()));
        let stream = Stream::connect(path.to_fs_name::<GenericFilePath>().unwrap()).unwrap();
        let started = std::time::Instant::now();
        let mut reader = BufReader::new(&stream);
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        assert!(line.contains("timed out"), "{line}");
        // EOF: the server dropped its end, so the instance is free.
        line.clear();
        assert_eq!(reader.read_line(&mut line).unwrap_or(0), 0);
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn request_over_the_limit_gets_an_error_reply() {
        let path = server("big");
        let stream = std::sync::Arc::new(Stream::connect(path.to_fs_name::<GenericFilePath>().unwrap()).unwrap());
        let big = "x".repeat(MAX_REQUEST as usize + 1024);
        let writer = stream.clone();
        // The server stops reading at the limit, so this write may fail.
        thread::spawn(move || {
            let _ = (&*writer).write_all(big.as_bytes());
        });
        let mut reply = String::new();
        BufReader::new(&*stream).read_line(&mut reply).unwrap();
        let reply: Value = serde_json::from_str(&reply).unwrap();
        assert_eq!(reply["ok"], false);
    }

    #[test]
    fn command_reaches_the_frontend_and_its_reply_comes_back() {
        let path = server_with("relay", READ_TIMEOUT, |event| {
            let id = event["id"].as_u64().unwrap();
            agent_control_reply(id, true, Some(json!({ "cmd": event["cmd"], "session": event["sessionId"] })), None).unwrap();
            Ok(())
        });
        let reply = ask(&path, "{\"session\":\"s1\",\"cmd\":\"tab.list\"}
");
        assert_eq!(reply, json!({ "ok": true, "data": { "cmd": "tab.list", "session": "s1" } }));
    }
}
