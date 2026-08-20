// Terminal preferences that live outside React state.
//
// The terminal is mounted once per tab and its xterm instance is long-lived, so
// a preference change has to reach every existing instance — not just the ones
// that happen to re-render. These helpers keep the value in localStorage and
// announce changes on a custom event, which each useTerminal subscribes to.

const SCROLLBACK_KEY = 'nevo-terminal:scrollback';
const PREFS_EVENT = 'lirah:terminal-prefs';

// xterm defaults to 1000 lines, which one long build log or agent turn blows
// straight through. 10k is roughly a session's worth without a real memory cost.
export const SCROLLBACK_DEFAULT = 10000;

export const SCROLLBACK_OPTIONS = [
  { value: 1000, label: '1,000 lines' },
  { value: 10000, label: '10,000 lines' },
  { value: 50000, label: '50,000 lines' },
  { value: 200000, label: '200,000 lines' },
];

export function getScrollback() {
  try {
    const raw = parseInt(localStorage.getItem(SCROLLBACK_KEY), 10);
    return Number.isFinite(raw) && raw > 0 ? raw : SCROLLBACK_DEFAULT;
  } catch {
    return SCROLLBACK_DEFAULT;
  }
}

export function setScrollback(lines) {
  try {
    localStorage.setItem(SCROLLBACK_KEY, String(lines));
  } catch {
    // Private mode / quota — the in-session dispatch below still applies it.
  }
  window.dispatchEvent(new CustomEvent(PREFS_EVENT));
}

// Fires on same-window changes (custom event) and on changes made by another
// window of the app (storage event). Returns an unsubscribe function.
export function subscribeTerminalPrefs(handler) {
  const onStorage = (e) => {
    if (!e.key || e.key === SCROLLBACK_KEY) handler();
  };
  window.addEventListener(PREFS_EVENT, handler);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PREFS_EVENT, handler);
    window.removeEventListener('storage', onStorage);
  };
}
