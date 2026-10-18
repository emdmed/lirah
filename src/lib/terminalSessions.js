import { invoke } from '@tauri-apps/api/core';

// Which PTY session each reattachable terminal owns, kept in sessionStorage:
// it survives a webview reload (when the backend sessions survive too) and is
// empty after an app restart (when they don't). An entry is removed when its
// terminal closes normally, so after a reload the entries left are exactly the
// sessions the new page should claim back.
const STORAGE_KEY = 'lirah:terminal-sessions:v1';

function read() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function write(map) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable: terminals just won't survive a reload.
  }
}

export function getTerminalSession(key) {
  return read()[key] ?? null;
}

export function rememberTerminalSession(key, sessionId) {
  write({ ...read(), [key]: sessionId });
}

export function forgetTerminalSession(key, sessionId) {
  const map = read();
  // Only drop our own entry: a newer terminal may already own the key.
  if (map[key] !== sessionId) return;
  delete map[key];
  write(map);
}

// Once per page load: close the sessions the previous page left behind that no
// terminal will reattach (their tabs were closed, or they weren't reattachable).
let reaped = false;
export function reapOrphanedTerminals() {
  if (reaped) return;
  reaped = true;
  invoke('reap_detached_terminals', { keep: Object.values(read()) }).catch((e) => {
    console.debug('Terminal reap skipped:', e);
  });
}
