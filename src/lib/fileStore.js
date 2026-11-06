// JS side of the Rust store (src-tauri/src/store.rs): JSON files under ~/.lirah
// with a `version` and a write `revision`. Paths are relative to ~/.lirah.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

const revisions = new Map(); // rel -> revision last read or written
const queues = new Map(); // rel -> tail promise, so writes to one file never race each other
const pending = new Map(); // rel -> { apply, timer, waiters } for debounced saves

const toApply = (data) => (typeof data === 'function' ? data : () => data);

/** Read a file. Returns `fallback` if it does not exist. */
export async function load(rel, fallback = null) {
  const doc = await invoke('store_read', { rel });
  revisions.set(rel, doc?.revision ?? 0);
  return doc ?? fallback;
}

async function write(rel, apply) {
  const expectedRevision = revisions.has(rel) ? revisions.get(rel) : null;
  let doc;
  try {
    doc = await invoke('store_write', { rel, data: apply(undefined), expectedRevision });
  } catch (err) {
    if (err?.kind !== 'conflict') throw err;
    // Someone else wrote the file: re-apply on top of what is there now, once.
    const current = err.current ?? null;
    doc = await invoke('store_write', { rel, data: apply(current), expectedRevision: current?.revision ?? 0 });
  }
  revisions.set(rel, doc.revision);
  return doc;
}

function enqueue(rel, apply) {
  const run = (queues.get(rel) ?? Promise.resolve()).catch(() => {}).then(() => write(rel, apply));
  queues.set(rel, run);
  return run;
}

/**
 * Write a file and resolve with the stored doc. `data` is the new content, or
 * `(current) => next`, which is called with `undefined` first and again with
 * the file on disk after a conflict. With `{ debounce: ms }` writes coalesce.
 */
export function save(rel, data, { debounce } = {}) {
  if (!debounce) return enqueue(rel, toApply(data));
  const prev = pending.get(rel);
  clearTimeout(prev?.timer);
  const fn = toApply(data);
  const entry = {
    // Debounced updaters compose so none of them is lost.
    apply: prev && typeof data === 'function' ? (cur) => fn(prev.apply(cur)) : fn,
    waiters: prev?.waiters ?? [],
  };
  entry.timer = setTimeout(() => flushOne(rel), debounce);
  pending.set(rel, entry);
  return new Promise((resolve, reject) => entry.waiters.push({ resolve, reject }));
}

function flushOne(rel) {
  const entry = pending.get(rel);
  if (!entry) return queues.get(rel) ?? Promise.resolve();
  clearTimeout(entry.timer);
  pending.delete(rel);
  const run = enqueue(rel, entry.apply);
  run.then(
    (doc) => entry.waiters.forEach((w) => w.resolve(doc)),
    (err) => entry.waiters.forEach((w) => w.reject(err)),
  );
  return run;
}

/** Write every debounced save now and wait for all queued writes. */
export function flush() {
  [...pending.keys()].forEach(flushOne);
  return Promise.allSettled([...queues.values()]);
}

/** Delete a file, dropping any pending save for it. */
export async function remove(rel) {
  const entry = pending.get(rel);
  if (entry) {
    clearTimeout(entry.timer);
    pending.delete(rel);
    entry.waiters.forEach((w) => w.resolve(null));
  }
  await (queues.get(rel) ?? Promise.resolve()).catch(() => {});
  await invoke('store_delete', { rel });
  revisions.set(rel, 0);
}

globalThis.addEventListener?.('beforeunload', () => { flush(); });
try {
  // onCloseRequested awaits this, then destroys the window (needs core:window:allow-destroy).
  getCurrentWindow().onCloseRequested(() => flush());
} catch {
  // Not running inside Tauri (plain vite or tests).
}
