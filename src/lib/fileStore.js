// JS side of the Rust store (src-tauri/src/store.rs): JSON files under ~/.lirah
// with a `version` and a write `revision`. Paths are relative to ~/.lirah, or to
// an absolute `base` folder via repoFiles(base).
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Map keys: the bare rel for ~/.lirah, `${base}\n${rel}` for a base folder.
const revisions = new Map(); // key -> revision last read or written
const queues = new Map(); // key -> tail promise, so writes to one file never race each other
const pending = new Map(); // key -> { apply, timer, waiters } for debounced saves

const toApply = (data) => (typeof data === 'function' ? data : () => data);
const keyOf = (base, rel) => (base ? `${base}\n${rel}` : rel);
const args = (base, rel) => (base ? { base, rel } : { rel });

async function loadAt(base, rel, fallback = null) {
  const doc = await invoke('store_read', args(base, rel));
  revisions.set(keyOf(base, rel), doc?.revision ?? 0);
  return doc ?? fallback;
}

async function write(base, rel, apply) {
  const key = keyOf(base, rel);
  const expectedRevision = revisions.has(key) ? revisions.get(key) : null;
  let doc;
  try {
    doc = await invoke('store_write', { ...args(base, rel), data: apply(undefined), expectedRevision });
  } catch (err) {
    if (err?.kind !== 'conflict') throw err;
    // Someone else wrote the file: re-apply on top of what is there now, once.
    const current = err.current ?? null;
    doc = await invoke('store_write', { ...args(base, rel), data: apply(current), expectedRevision: current?.revision ?? 0 });
  }
  revisions.set(key, doc.revision);
  return doc;
}

function enqueue(base, rel, apply) {
  const key = keyOf(base, rel);
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(() => write(base, rel, apply));
  queues.set(key, run);
  return run;
}

function saveAt(base, rel, data, { debounce } = {}) {
  if (!debounce) return enqueue(base, rel, toApply(data));
  const key = keyOf(base, rel);
  const prev = pending.get(key);
  clearTimeout(prev?.timer);
  const fn = toApply(data);
  const entry = {
    // Debounced updaters compose so none of them is lost.
    apply: prev && typeof data === 'function' ? (cur) => fn(prev.apply(cur)) : fn,
    waiters: prev?.waiters ?? [],
    base,
    rel,
  };
  entry.timer = setTimeout(() => flushOne(key), debounce);
  pending.set(key, entry);
  return new Promise((resolve, reject) => entry.waiters.push({ resolve, reject }));
}

function flushOne(key) {
  const entry = pending.get(key);
  if (!entry) return queues.get(key) ?? Promise.resolve();
  clearTimeout(entry.timer);
  pending.delete(key);
  const run = enqueue(entry.base, entry.rel, entry.apply);
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

async function writeTextAt(base, rel, text) {
  const path = `${base ?? `${await invoke('get_home_dir')}/.lirah`}/${rel}`;
  await invoke('write_file_content', { path, content: text });
  return path;
}

async function removeAt(base, rel) {
  const k = keyOf(base, rel);
  const inside = (key) => key === k || key.startsWith(`${k}/`);
  for (const [key, entry] of pending) {
    if (!inside(key)) continue;
    clearTimeout(entry.timer);
    pending.delete(key);
    entry.waiters.forEach((w) => w.resolve(null));
  }
  await Promise.allSettled([...queues].filter(([key]) => inside(key)).map(([, q]) => q));
  await invoke('store_delete', args(base, rel));
  for (const key of revisions.keys()) if (inside(key)) revisions.set(key, 0);
}

const watchers = new Set(); // { base, test(rel), onChange(doc, rel) }

function onExternalChangeAt(base, test, onChange) {
  const w = { base, test, onChange };
  watchers.add(w);
  return () => watchers.delete(w);
}

/** Read a file. Returns `fallback` if it does not exist. */
export const load = (rel, fallback) => loadAt(null, rel, fallback);

/**
 * Write a file and resolve with the stored doc. `data` is the new content, or
 * `(current) => next`, which is called with `undefined` first and again with
 * the file on disk after a conflict. With `{ debounce: ms }` writes coalesce.
 */
export const save = (rel, data, opts) => saveAt(null, rel, data, opts);

/** Write a plain text file (not a store doc) at `rel`; resolves with its absolute path. */
export const writeText = (rel, text) => writeTextAt(null, rel, text);

/** Names in a folder (files and subfolders), sorted; empty if it does not exist. */
export const list = (rel) => invoke('store_list', { rel });

/** Delete a file or a folder, dropping pending saves for it or anything inside it. */
export const remove = (rel) => removeAt(null, rel);

/**
 * Call `onChange(doc, rel)` when a file matching `test(rel)` is changed by
 * someone else (the CLI, an editor); `doc` is null if it was deleted. Returns
 * an unsubscribe function.
 */
export const onExternalChange = (test, onChange) => onExternalChangeAt(null, test, onChange);

/** The same API with every path relative to the absolute folder `base` (e.g. <repo>/lirah/plans). */
export function repoFiles(base) {
  return {
    load: (rel, fallback) => loadAt(base, rel, fallback),
    save: (rel, data, opts) => saveAt(base, rel, data, opts),
    list: (rel) => invoke('store_list', { base, rel }),
    remove: (rel) => removeAt(base, rel),
    writeText: (rel, text) => writeTextAt(base, rel, text),
    onExternalChange: (test, onChange) => onExternalChangeAt(base, test, onChange),
  };
}

/**
 * Re-read changed files (relative to `base`, or ~/.lirah) and notify, skipping
 * writes this window made itself (same revision).
 */
export function reloadChanged(rels, base = null) {
  for (const rel of rels) {
    const subs = [...watchers].filter((w) => w.base === base && w.test(rel));
    if (!subs.length) continue;
    const key = keyOf(base, rel);
    // Queued like a write, so it never reads between our write and its revision update.
    const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const doc = await invoke('store_read', args(base, rel));
      const revision = doc?.revision ?? 0;
      if (revisions.get(key) === revision) return;
      revisions.set(key, revision);
      for (const w of subs) {
        try { w.onChange(doc, rel); } catch (e) { console.error(`Reloading ${rel} failed:`, e); }
      }
    });
    queues.set(key, run.catch((e) => console.warn(`Failed to reload ${rel}:`, e)));
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
