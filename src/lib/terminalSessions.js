import { invoke } from '@tauri-apps/api/core';

// Which PTY session each reattachable terminal owns, kept per workspace in
// workspace.json as terminalSessions { tabId: sessionId }. After a reload the
// backend sessions survive and are claimed back; after an app restart the ids
// are stale, attach_terminal fails and a fresh session replaces the entry.
// Entries of closed tabs are dropped when the workspace is saved.
import { getWorkspaceData, setWorkspaceData, allWorkspaceData, workspaceOfTab } from './workspaceStore';

const KEY = 'terminalSessions';

export function getTerminalSession(tabId) {
  const ws = workspaceOfTab(tabId);
  return ws ? getWorkspaceData(ws, KEY)[tabId] ?? null : null;
}

export function rememberTerminalSession(tabId, sessionId) {
  const ws = workspaceOfTab(tabId);
  if (ws) setWorkspaceData(ws, KEY, { ...getWorkspaceData(ws, KEY), [tabId]: sessionId });
}

export function forgetTerminalSession(tabId, sessionId) {
  const ws = workspaceOfTab(tabId);
  if (!ws) return;
  const map = getWorkspaceData(ws, KEY);
  // Only drop our own entry: a newer terminal may already own the key.
  if (map[tabId] !== sessionId) return;
  const { [tabId]: _, ...rest } = map;
  setWorkspaceData(ws, KEY, rest);
}

// Once per page load: close the sessions the previous page left behind that no
// terminal will reattach (their tabs were closed, or they weren't reattachable).
let reaped = false;
export function reapOrphanedTerminals() {
  if (reaped) return;
  reaped = true;
  invoke('reap_detached_terminals', { keep: allWorkspaceData(KEY).flatMap(Object.values) }).catch((e) => {
    console.debug('Terminal reap skipped:', e);
  });
}
