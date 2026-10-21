// Terminal preferences that live outside React state.
//
// The terminal is mounted once per tab and its xterm instance is long-lived, so
// a preference change has to reach every existing instance — not just the ones
// that happen to re-render. The value lives in settingsStore (which migrated
// the old nevo-terminal:scrollback key), and each useTerminal subscribes to it.

import { getSettings, setSetting, SETTINGS_DEFAULTS, subscribeSettings } from '../features/settings/settingsStore';

// xterm defaults to 1000 lines, which one long build log or agent turn blows
// straight through. 10k is roughly a session's worth without a real memory cost.
export const SCROLLBACK_DEFAULT = SETTINGS_DEFAULTS.scrollback;

// Past this, scrollback gets expensive: each line costs memory per column (a
// 200-column terminal at 200k lines is hundreds of MB), and every resize
// reflows the whole buffer. The settings UI flags options above it.
export const SCROLLBACK_WARN_THRESHOLD = 50000;

export const SCROLLBACK_OPTIONS = [
  { value: 1000, label: '1,000 lines' },
  { value: 10000, label: '10,000 lines' },
  { value: 50000, label: '50,000 lines' },
  { value: 200000, label: '200,000 lines' },
];

export function getScrollback() {
  const lines = getSettings().scrollback;
  return Number.isFinite(lines) && lines > 0 ? lines : SCROLLBACK_DEFAULT;
}

export function setScrollback(lines) {
  setSetting('scrollback', lines);
}

// Fires on any settings change, in this window or another one; the handler
// reads the value again. Returns an unsubscribe function.
export function subscribeTerminalPrefs(handler) {
  return subscribeSettings(handler);
}
