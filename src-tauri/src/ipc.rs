//! IPC plumbing shared by the commands.
//!
//! - [`blocking`] runs a command body on the blocking pool. In Tauri 2 a plain
//!   `#[tauri::command] fn` runs on the main thread, which on Linux is the
//!   GTK/WebKit UI thread, so any IO or subprocess there freezes the window.
//! - `LIRAH_TRACE_IPC=1` logs every command that takes longer than 16 ms: the
//!   time spent dispatching it on the invoking thread (all of a sync command's
//!   work) and, for bodies run through [`blocking`], their total duration.

use std::sync::OnceLock;
use std::thread::ThreadId;
use std::time::{Duration, Instant};
use tauri::ipc::Invoke;
use tauri::Runtime;

/// One frame at 60 Hz; anything longer on the main thread is a visible hitch.
const SLOW: Duration = Duration::from_millis(16);

static TRACE: OnceLock<bool> = OnceLock::new();
static MAIN_THREAD: OnceLock<ThreadId> = OnceLock::new();

/// Record the main thread. Call once from `run()` before the app starts.
pub fn init() {
    MAIN_THREAD.get_or_init(|| std::thread::current().id());
    if tracing_enabled() {
        eprintln!("[ipc] tracing enabled: logging commands slower than {} ms", SLOW.as_millis());
    }
}

fn tracing_enabled() -> bool {
    *TRACE.get_or_init(|| std::env::var("LIRAH_TRACE_IPC").is_ok_and(|v| v == "1"))
}

fn on_main_thread() -> bool {
    MAIN_THREAD
        .get()
        .is_some_and(|id| *id == std::thread::current().id())
}

fn report(command: &str, phase: &str, elapsed: Duration, main_thread: bool) {
    if elapsed >= SLOW {
        eprintln!(
            "[ipc] {} {} took {:.1} ms (main_thread={})",
            command,
            phase,
            elapsed.as_secs_f64() * 1000.0,
            main_thread
        );
    }
}

/// Wrap the generated invoke handler so dispatch time is traced. Sync commands
/// run entirely inside the handler, so this is their full cost; async commands
/// only pay argument parsing here.
pub fn wrap<R: Runtime>(
    handler: impl Fn(Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    move |invoke| {
        if !tracing_enabled() {
            return handler(invoke);
        }
        let command = invoke.message.command().to_string();
        let main_thread = on_main_thread();
        let start = Instant::now();
        let handled = handler(invoke);
        report(&command, "dispatch", start.elapsed(), main_thread);
        handled
    }
}

/// Run a blocking command body on the blocking pool. `command` names it in
/// traces and in the error if the body panics.
pub async fn blocking<T, F>(command: &'static str, body: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let start = tracing_enabled().then(Instant::now);
    let result = tauri::async_runtime::spawn_blocking(body)
        .await
        .map_err(|e| format!("{} failed: {}", command, e))?;
    if let Some(start) = start {
        report(command, "total", start.elapsed(), false);
    }
    result
}
