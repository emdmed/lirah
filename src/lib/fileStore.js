// JS side of the Rust store (src-tauri/src/store.rs): JSON files under ~/.lirah
// with a `version` and a write `revision`. Paths are relative to ~/.lirah.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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

/** Write a plain text file (not a store doc) at `rel`; resolves with its absolute path. */
export async function writeText(rel, text) {
  const path = `${await invoke('get_home_dir')}/.lirah/${rel}`;
  await invoke('write_file_content', { path, content: text });
  return path;
}

/** Names in a folder (files and subfolders), sorted; empty if it does not exist. */
export function list(rel) {
  return invoke('store_list', { rel });
}

/** Delete a file or a folder, dropping pending saves for it or anything inside it. */
export async function remove(rel) {
  const inside = (key) => key === rel || key.startsWith(`${rel}/`);
  for (const [key, entry] of pending) {
    if (!inside(key)) continue;
    clearTimeout(entry.timer);
    pending.delete(key);
    entry.waiters.forEach((w) => w.resolve(null));
  }
  await Promise.allSettled([...queues].filter(([key]) => inside(key)).map(([, q]) => q));
  await invoke('store_delete', { rel });
  for (const key of revisions.keys()) if (inside(key)) revisions.set(key, 0);
}

const watchers = new Set(); // { test(rel), onChange(doc, rel) }

/**
 * Call `onChange(doc, rel)` when a file matching `test(rel)` is changed by
 * someone else (the CLI, an editor); `doc` is null if it was deleted. Returns
 * an unsubscribe function.
 */
export function onExternalChange(test, onChange) {
  const w = { test, onChange };
  watchers.add(w);
  return () => watchers.delete(w);
}

/** Re-read changed files and notify, skipping writes this window made itself (same revision). */
export function reloadChanged(rels) {
  for (const rel of rels) {
    const subs = [...watchers].filter((w) => w.test(rel));
    if (!subs.length) continue;
    // Queued like a write, so it never reads between our write and its revision update.
    const run = (queues.get(rel) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const doc = await invoke('store_read', { rel });
      const revision = doc?.revision ?? 0;
      if (revisions.get(rel) === revision) return;
      revisions.set(rel, revision);
      for (const w of subs) {
        try { w.onChange(doc, rel); } catch (e) { console.error(`Reloading ${rel} failed:`, e); }
      }
    });
    queues.set(rel, run.catch((e) => console.warn(`Failed to reload ${rel}:`, e)));
  }
}

globalThis.addEventListener?.('beforeunload', () => { flush(); });
try {
  // onCloseRequested awaits this, then destroys the window (needs core:window:allow-destroy).
  getCurrentWindow().onCloseRequested(() => flush());
  listen('lirah-files-changed', (e) => reloadChanged(e.payload)).catch(() => {});
  invoke('start_lirah_watcher')?.catch?.((e) => console.warn('Failed to watch ~/.lirah:', e));
} catch {
  // Not running inside Tauri (plain vite or tests).
}
