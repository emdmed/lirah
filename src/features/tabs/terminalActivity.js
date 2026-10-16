// Last PTY output per terminal session, plus which session is each tab's main
// terminal. Plain module state with no React: the terminal writes on every chunk
// and only the tabs summary pane reads it, on its own tick.

// Output this soon after a keystroke is treated as the echo, not as activity.
const ECHO_WINDOW_MS = 300;

const lastOutputAt = new Map(); // sessionId -> epoch ms
const lastInputAt = new Map(); // sessionId -> epoch ms
const tabSessions = new Map(); // tabId -> sessionId

export function markTerminalInput(sessionId) {
  if (sessionId) lastInputAt.set(sessionId, Date.now());
}

export function markTerminalOutput(sessionId) {
  if (!sessionId) return;
  const now = Date.now();
  if (now - (lastInputAt.get(sessionId) || 0) < ECHO_WINDOW_MS) return;
  lastOutputAt.set(sessionId, now);
}

export function registerTabSession(tabId, sessionId) {
  tabSessions.set(tabId, sessionId);
  return () => {
    if (tabSessions.get(tabId) === sessionId) tabSessions.delete(tabId);
    lastOutputAt.delete(sessionId);
    lastInputAt.delete(sessionId);
  };
}

export function getTabSession(tabId) {
  return tabSessions.get(tabId) || null;
}

export function getLastOutputAt(sessionId) {
  return lastOutputAt.get(sessionId) || null;
}
