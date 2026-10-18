//! Per-session PTY handle.
//!
//! Each session lives behind its own `Arc<SessionHandle>`: commands clone the
//! `Arc` out of the session map and release the map lock immediately, so a
//! stalled session can never block another one (or anything else behind the
//! global state lock).
//!
//! Input goes through a dedicated writer thread fed by an mpsc channel, so
//! `write_to_terminal` never blocks on a child that has stopped reading (a big
//! paste into a busy TUI) and keystrokes keep their order.
//!
//! Output goes through an `OutputSink`, which keeps the tail of everything the
//! shell printed. A webview reload drops the frontend's channel but not the
//! session; the fresh frontend reattaches and the tail is replayed into it.

use portable_pty::{Child, ExitStatus, MasterPty, PtySize};
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Condvar, Mutex, MutexGuard};
use std::thread;
use tauri::ipc::{Channel, InvokeResponseBody};

fn lock<T: ?Sized>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panic while holding one of these locks leaves nothing half-updated
    // worth refusing to touch; keep the session usable.
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Flow-control gate for the reader thread. The frontend pauses it when xterm
/// falls behind (too many bytes written but not yet parsed); while paused the
/// reader stops draining the PTY, so the kernel buffer fills and the child is
/// throttled naturally. Closing the gate always unparks the reader.
pub struct ReaderGate {
    paused: AtomicBool,
    closed: AtomicBool,
    lock: Mutex<()>,
    cv: Condvar,
}

impl ReaderGate {
    fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            closed: AtomicBool::new(false),
            lock: Mutex::new(()),
            cv: Condvar::new(),
        }
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        // Flip under the lock so a reader between its check and its wait
        // cannot miss the wakeup.
        let _g = lock(&self.lock);
        self.paused.store(false, Ordering::SeqCst);
        self.cv.notify_all();
    }

    pub fn close(&self) {
        let _g = lock(&self.lock);
        self.closed.store(true, Ordering::SeqCst);
        self.cv.notify_all();
    }

    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::SeqCst)
    }

    /// Block while paused. Returns `false` once the gate is closed.
    pub fn wait_while_paused(&self) -> bool {
        if self.paused.load(Ordering::SeqCst) {
            let mut g = lock(&self.lock);
            while self.paused.load(Ordering::SeqCst) && !self.closed.load(Ordering::SeqCst) {
                g = self.cv.wait(g).unwrap_or_else(|e| e.into_inner());
            }
        }
        !self.is_closed()
    }
}

/// How much output a session keeps for replay on reattach. About the default
/// 10k-line scrollback of ordinary shell output.
const REPLAY_LIMIT: usize = 1024 * 1024;
/// After trimming the replay buffer from the front, skip at most this far to
/// the next newline so the replay doesn't start inside an escape sequence or a
/// UTF-8 character.
const REPLAY_RESYNC_WINDOW: usize = 4096;

struct SinkState {
    /// The frontend currently attached, if any. `None` while the webview is
    /// reloading: output keeps landing in `replay` until someone reattaches.
    channel: Option<Channel>,
    replay: VecDeque<u8>,
    detached: bool,
}

/// Where a session's output goes: the attached frontend, plus a bounded
/// replay buffer. Sends happen under the lock so a reattach can't interleave
/// its replay with live output.
pub struct OutputSink {
    state: Mutex<SinkState>,
}

impl OutputSink {
    fn new() -> Self {
        Self {
            state: Mutex::new(SinkState {
                channel: None,
                replay: VecDeque::new(),
                detached: false,
            }),
        }
    }

    pub fn emit(&self, data: Vec<u8>) {
        let mut st = lock(&self.state);
        st.replay.extend(data.iter().copied());
        if st.replay.len() > REPLAY_LIMIT {
            let excess = st.replay.len() - REPLAY_LIMIT;
            st.replay.drain(..excess);
            let resync = st
                .replay
                .iter()
                .take(REPLAY_RESYNC_WINDOW)
                .position(|b| *b == b'\n')
                .map_or(0, |i| i + 1);
            st.replay.drain(..resync);
        }
        if let Some(channel) = &st.channel {
            // Fails only once the webview is gone; the replay still has it.
            let _ = channel.send(InvokeResponseBody::Raw(data));
        }
    }

    /// Route output to `channel`, first replaying what the session has printed.
    pub fn attach(&self, channel: Channel, replay: bool) {
        let mut st = lock(&self.state);
        if replay && !st.replay.is_empty() {
            let (a, b) = st.replay.as_slices();
            let _ = channel.send(InvokeResponseBody::Raw([a, b].concat()));
        }
        st.channel = Some(channel);
        st.detached = false;
    }

    /// The frontend went away without closing the session (a reload). A sink
    /// that never had a frontend (a hidden terminal) isn't detachable, so the
    /// reap after a reload leaves it running.
    pub fn detach(&self) {
        let mut st = lock(&self.state);
        if st.channel.take().is_none() {
            return;
        }
        st.detached = true;
    }

    pub fn is_detached(&self) -> bool {
        lock(&self.state).detached
    }
}

/// The child process, with its PID cached so callers can read it without
/// taking the lock that `kill`/`wait` need.
pub struct ChildHandle {
    pid: Option<u32>,
    inner: Mutex<Box<dyn Child + Send + Sync>>,
}

impl ChildHandle {
    fn new(child: Box<dyn Child + Send + Sync>) -> Self {
        Self {
            pid: child.process_id(),
            inner: Mutex::new(child),
        }
    }

    pub fn process_id(&self) -> Option<u32> {
        self.pid
    }

    pub fn kill(&self) -> std::io::Result<()> {
        lock(&self.inner).kill()
    }

    /// Blocks until the child exits. Call from a blocking thread only.
    pub fn wait(&self) -> std::io::Result<ExitStatus> {
        lock(&self.inner).wait()
    }
}

pub struct SessionHandle {
    master: Mutex<Box<dyn MasterPty + Send>>,
    pub child: ChildHandle,
    input: Sender<Vec<u8>>,
    pub gate: ReaderGate,
    pub output: OutputSink,
    pub sandboxed: bool,
}

impl SessionHandle {
    /// Wrap a freshly spawned PTY: starts its writer thread and hands back the
    /// output reader for the caller's reader thread.
    pub fn new(
        master: Box<dyn MasterPty + Send>,
        child: Box<dyn Child + Send + Sync>,
        sandboxed: bool,
    ) -> Result<(Self, Box<dyn Read + Send>), String> {
        let reader = master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;
        let writer = master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let (input, rx) = mpsc::channel::<Vec<u8>>();
        // Exits once every sender is gone (the session was dropped) or the PTY
        // stops accepting writes (the child died).
        thread::spawn(move || writer_loop(writer, rx));

        Ok((
            Self {
                master: Mutex::new(master),
                child: ChildHandle::new(child),
                input,
                gate: ReaderGate::new(),
                output: OutputSink::new(),
                sandboxed,
            },
            reader,
        ))
    }

    /// Queue input for the writer thread. Never blocks.
    pub fn write(&self, data: Vec<u8>) -> Result<(), String> {
        self.input
            .send(data)
            .map_err(|_| "PTY writer has stopped".to_string())
    }

    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        lock(&self.master)
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))
    }

    /// Make a full-screen app (nvim, lazygit, an agent TUI) repaint after a
    /// reattach. The replay alone can leave it half-drawn when its start was
    /// trimmed, and resizing to the same size sends no SIGWINCH, so step one
    /// column narrower and back.
    pub fn nudge_redraw(&self) {
        let master = lock(&self.master);
        let Ok(size) = master.get_size() else { return };
        if size.cols < 2 {
            return;
        }
        let _ = master.resize(PtySize { cols: size.cols - 1, ..size });
        let _ = master.resize(size);
    }

    /// Stop the session: unpark the reader, then kill and reap the child.
    /// Blocks on `wait`, so call it from a blocking thread.
    pub fn terminate(&self) {
        self.gate.close();
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn writer_loop(mut writer: Box<dyn Write + Send>, rx: mpsc::Receiver<Vec<u8>>) {
    while let Ok(mut data) = rx.recv() {
        // Coalesce whatever queued up while the last write was blocked, so a
        // burst of keystrokes costs one write + flush instead of one each.
        while let Ok(more) = rx.try_recv() {
            data.extend_from_slice(&more);
        }
        if let Err(e) = writer.write_all(&data).and_then(|_| writer.flush()) {
            eprintln!("Failed to write to PTY: {}", e);
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replay(sink: &OutputSink) -> Vec<u8> {
        lock(&sink.state).replay.iter().copied().collect()
    }

    #[test]
    fn replay_keeps_the_tail_from_a_line_start() {
        let sink = OutputSink::new();
        sink.emit(b"first line\n".to_vec());
        assert_eq!(replay(&sink), b"first line\n");

        // Overflow with ordinary lines: wherever the cut lands, the replay
        // skips to the next line start instead of starting inside one.
        // 13-byte lines, so the limit falls inside one.
        let lines: String = (0..REPLAY_LIMIT / 13 + 2).map(|n| format!("line {:07}\n", n)).collect();
        sink.emit(lines.into_bytes());
        sink.emit(b"last\n".to_vec());
        let kept = replay(&sink);
        assert!(kept.len() <= REPLAY_LIMIT);
        assert!(kept.starts_with(b"line "), "replay starts mid-line");
        assert!(kept.ends_with(b"\nlast\n"));
    }

    #[test]
    fn detach_needs_an_attached_frontend() {
        let sink = OutputSink::new();
        // A hidden terminal never had a channel, so it never counts as detached.
        sink.detach();
        assert!(!sink.is_detached());
    }
}
