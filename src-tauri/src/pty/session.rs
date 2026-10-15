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

use portable_pty::{Child, ExitStatus, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Condvar, Mutex, MutexGuard};
use std::thread;

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
