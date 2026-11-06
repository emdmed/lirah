import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// JS side of the files under ~/.lirah (the Rust side is src-tauri/src/persistence).
// Build every `file` path from the home dir with lirahDir(home): the change
// events are matched against it, and a path spelled differently would not match.
// See docs/persistence.md for how the pieces fit.

const DEBOUNCE_MS = 400; // same as the task and plan stores
const MAX_ATTEMPTS = 3;
const NEW_FILE_VERSION = 1;
const CHANGED_EVENT = 'lirah-file-changed';

// Files with changes not yet on disk, by path. `pending` holds the update
// functions rather than their result, so they can run again on fresh data
// after a conflict.
//   { version, revision, base (data on disk), pending: [fn], timer, saving }
const dirty = new Map();

const readDisk = (file) => invoke('read_persisted', { path: file });
const isConflict = (error) => String(error).startsWith('conflict:');
const dataOf = (entry) => entry.pending.reduce((data, fn) => fn(data), entry.base);

/**
 * The file as `{ version, revision, data }`, or null if it does not exist.
 * Includes changes from `update` that are still waiting to be saved.
 */
export async function read(file) {
  const entry = dirty.get(file);
  if (entry) return { version: entry.version, revision: entry.revision, data: dataOf(entry) };
  return readDisk(file);
}

/**
 * Change a file: `fn(data)` returns the new data (`data` is null for a file
 * that does not exist yet). `fn` must be pure, a conflict runs it again on the
 * newer data. The save is debounced; returns the new data at once.
 * `version` is only used when the file is created.
 */
export async function update(file, fn, version = NEW_FILE_VERSION) {
  if (!dirty.has(file)) {
    const disk = (await readDisk(file)) ?? { version, revision: 0, data: null };
    // Another update may have opened the file while we were reading.
    if (!dirty.has(file)) {
      dirty.set(file, { version: disk.version, revision: disk.revision, base: disk.data, pending: [] });
    }
  }
  // No await from here: the entry cannot be dropped by a finishing save.
  const entry = dirty.get(file);
  entry.pending.push(fn);
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => save(file), DEBOUNCE_MS);
  return dataOf(entry);
}

/** Save every file with waiting changes now. Call it before the window closes. */
export function flushAll() {
  return Promise.all([...dirty.keys()].map(save));
}

/**
 * Call `cb(revision)` when another process changes `file`. Resolves to the
 * function that stops listening.
 */
export async function subscribe(file, cb) {
  await startWatcher();
  return listen(CHANGED_EVENT, ({ payload }) => {
    if (samePath(payload.path, file)) cb(payload.revision);
  });
}

/**
 * Bring a file up to the latest schema. `steps` maps a version to the function
 * that upgrades it to the next one: `{ 1: (data) => ..., 2: (data) => ... }`.
 * Only the steps from the file's version on run. The file is backed up first
 * and written once at the end, so a failing step leaves it as it was.
 */
export async function migrate(file, steps) {
  const disk = await readDisk(file);
  const latest = Math.max(...Object.keys(steps).map(Number)) + 1;
  if (!disk || disk.version >= latest) return;

  await invoke('backup_persisted', { path: file });
  let data = disk.data;
  for (let version = disk.version; version < latest; version++) {
    if (!steps[version]) throw new Error(`${file}: no migration step from version ${version}`);
    data = await steps[version](data);
  }
  await invoke('write_persisted', { path: file, version: latest, data, expectedRevision: disk.revision });
}

// Saves of one file run one after the other.
function save(file) {
  const entry = dirty.get(file);
  if (!entry) return Promise.resolve();
  clearTimeout(entry.timer);
  entry.saving = (entry.saving ?? Promise.resolve()).then(() => saveEntry(file, entry));
  return entry.saving;
}

async function saveEntry(file, entry) {
  if (entry.pending.length === 0) return;
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        return await write(file, entry);
      } catch (error) {
        if (!isConflict(error) || attempt === MAX_ATTEMPTS) throw error;
        await rebase(file, entry);
      }
    }
  } catch (error) {
    // The changes stay in `pending`: the next update or flushAll tries again.
    console.error(`Failed to save ${file}:`, error);
  }
}

async function write(file, entry) {
  const count = entry.pending.length; // updates that arrive during the write wait for the next save
  const data = dataOf(entry);
  const saved = await invoke('write_persisted', {
    path: file,
    version: entry.version,
    data,
    expectedRevision: entry.revision,
  });
  entry.revision = saved.revision;
  entry.base = data;
  entry.pending.splice(0, count);
  if (entry.pending.length === 0) dirty.delete(file);
  else entry.timer = setTimeout(() => save(file), DEBOUNCE_MS);
}

// Someone else wrote first: start again from what is on disk now.
async function rebase(file, entry) {
  const disk = await readDisk(file);
  entry.version = disk?.version ?? entry.version;
  entry.revision = disk?.revision ?? 0;
  entry.base = disk?.data ?? null;
}

let watching = null;
function startWatcher() {
  watching ??= invoke('start_persistence_watcher').catch((error) => {
    watching = null; // let the next subscribe try again
    throw error;
  });
  return watching;
}

// The events carry the path as the OS spells it; Windows uses backslashes.
const forwardSlashes = (path) => path.split('\\').join('/');
const samePath = (a, b) => forwardSlashes(a) === forwardSlashes(b);
