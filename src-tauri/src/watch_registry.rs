//! Ref-counted registry for watchers keyed by path.
//!
//! Several tabs can watch the same project. Without a count, closing one tab
//! stopped the watcher the others still relied on. `acquire` adds a user and
//! `release` drops one; the handle is dropped (which stops its thread) only when
//! the last user is gone.
//!
//! Building a watcher can be slow (it walks the tree), so it happens outside
//! the lock: `acquire` reserves a slot, the caller builds, then `attach` fills
//! it. A slot released to zero while its watcher was still being built is gone
//! by the time `attach` runs, so the fresh watcher is dropped instead of leaked.

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

struct Slot<H> {
    users: usize,
    generation: u64,
    handle: Option<H>,
}

pub enum Acquired {
    /// Someone already watches this key; the count was bumped, nothing to build.
    Existing,
    /// First user: build the watcher, then `attach` (or `abandon`) with this token.
    New(u64),
}

pub struct WatchRegistry<K, H> {
    slots: Mutex<HashMap<K, Slot<H>>>,
    next_generation: AtomicU64,
}

impl<K: Eq + Hash + Clone, H> WatchRegistry<K, H> {
    pub fn new() -> Self {
        Self {
            slots: Mutex::new(HashMap::new()),
            next_generation: AtomicU64::new(1),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<K, Slot<H>>> {
        self.slots.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn acquire(&self, key: &K) -> Acquired {
        let mut slots = self.lock();
        if let Some(slot) = slots.get_mut(key) {
            slot.users += 1;
            return Acquired::Existing;
        }
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        slots.insert(
            key.clone(),
            Slot {
                users: 1,
                generation,
                handle: None,
            },
        );
        Acquired::New(generation)
    }

    /// Store the built handle. Returns false (and drops it) if every user
    /// released the key while it was being built.
    pub fn attach(&self, key: &K, generation: u64, handle: H) -> bool {
        let mut slots = self.lock();
        match slots.get_mut(key) {
            Some(slot) if slot.generation == generation => {
                slot.handle = Some(handle);
                true
            }
            _ => false,
        }
    }

    /// Building failed: forget the reserved slot so a later start retries.
    pub fn abandon(&self, key: &K, generation: u64) {
        let mut slots = self.lock();
        if slots.get(key).is_some_and(|s| s.generation == generation) {
            slots.remove(key);
        }
    }

    /// Drop one user; the handle goes when the last one does.
    pub fn release(&self, key: &K) {
        let removed = {
            let mut slots = self.lock();
            match slots.get_mut(key) {
                Some(slot) if slot.users > 1 => {
                    slot.users -= 1;
                    None
                }
                Some(_) => slots.remove(key),
                None => None,
            }
        };
        // Drop the handle outside the lock: it may join or signal a thread.
        drop(removed);
    }

    pub fn clear(&self) {
        let drained: Vec<Slot<H>> = self.lock().drain().map(|(_, s)| s).collect();
        drop(drained);
    }
}

/// After a first event, keep taking events until `quiet` passes without one,
/// but never longer than `max_wait` from `start`, so a file written without
/// pause (a streaming transcript, a log) cannot hold the notification back.
pub fn drain_debounced<T>(
    rx: &std::sync::mpsc::Receiver<T>,
    start: std::time::Instant,
    quiet: std::time::Duration,
    max_wait: std::time::Duration,
    mut on_event: impl FnMut(T),
) {
    loop {
        let remaining = max_wait.saturating_sub(start.elapsed());
        if remaining.is_zero() {
            return;
        }
        match rx.recv_timeout(quiet.min(remaining)) {
            Ok(event) => on_event(event),
            Err(_) => return,
        }
    }
}
