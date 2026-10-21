import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { createEmitter } from '../../lib/createStore';

// App preferences in one module-level store, persisted under one key.
//
// Every tab reads it through useSyncExternalStore, so a change made in one tab
// reaches every other open tab in the same render. The `storage` event carries
// changes made by another window of the app.
//
// A few values are "seeded" rather than shared (see useSeededSetting): the
// store holds the default a new tab starts with, but each tab keeps its own
// live copy because the value is bound to that tab's running process (sandbox,
// network isolation, CLI) or layout (sidebar, file view).

export const SETTINGS_KEY = 'lirah:settings:v1';

export const SETTINGS_DEFAULTS = {
  sandboxEnabled: false,
  networkIsolation: false,
  showTitleBar: true,
  keepFilesAfterSend: false,
  // Launch the CLI automatically when a starred (bookmarked) repo is opened.
  // Never applies to tabs restored at startup: that isn't a deliberate act.
  autoLaunchCli: true,
  selectedCli: 'claude-code',
  autoChangelogEnabled: false,
  autoChangelogTarget: 'CHANGELOG.md',
  autoChangelogTrigger: 'commit',
  autoChangelogCli: 'claude-code',
  autoCommitCli: 'claude-code',
  autoCommitCustomPrompt: '',
  sidebarOpen: true,
  sidebarWidth: 280,
  viewMode: 'flat',
};

// Pre-v1 keys, one per preference. Read once on first load to migrate; never
// written or removed, so an older build still finds its values.
const LEGACY_KEYS = {
  sandboxEnabled: 'nevo-terminal:sandbox-enabled',
  networkIsolation: 'nevo-terminal:network-isolation',
  showTitleBar: 'nevo-terminal:show-title-bar',
  keepFilesAfterSend: 'nevo-terminal:keep-files-after-send',
  autoLaunchCli: 'nevo-terminal:auto-launch-cli',
  autoChangelogEnabled: 'nevo-terminal:auto-changelog-enabled',
  autoChangelogTarget: 'nevo-terminal:auto-changelog-target',
  autoChangelogTrigger: 'nevo-terminal:auto-changelog-trigger',
  autoChangelogCli: 'nevo-terminal:auto-changelog-cli',
  autoCommitCli: 'nevo-terminal:auto-commit-cli',
  autoCommitCustomPrompt: 'nevo-terminal:auto-commit-custom-prompt',
};
// Stored as a bare string, not JSON.
const LEGACY_SELECTED_CLI_KEY = 'nevo-terminal:selected-cli';

// Keep only known keys whose type matches the default, so a corrupt or
// hand-edited blob can't put a string where a boolean belongs.
function sanitize(raw) {
  const out = { ...SETTINGS_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(SETTINGS_DEFAULTS)) {
    if (key in raw && typeof raw[key] === typeof SETTINGS_DEFAULTS[key]) out[key] = raw[key];
  }
  return out;
}

function readLegacy() {
  const raw = {};
  for (const [key, legacyKey] of Object.entries(LEGACY_KEYS)) {
    try {
      const saved = localStorage.getItem(legacyKey);
      if (saved !== null) raw[key] = JSON.parse(saved);
    } catch { /* unreadable legacy value: keep the default */ }
  }
  try {
    const cli = localStorage.getItem(LEGACY_SELECTED_CLI_KEY);
    if (cli) raw.selectedCli = cli;
  } catch { /* storage unavailable */ }
  return raw;
}

function persist(next) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn(`Failed to save ${SETTINGS_KEY} to localStorage:`, error);
  }
}

function load() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved !== null) return sanitize(JSON.parse(saved));
  } catch { /* corrupt blob or storage unavailable: fall through */ }
  const migrated = sanitize(readLegacy());
  persist(migrated);
  return migrated;
}

let state = load();
// Listens for other windows' writes only while something is subscribed.
const { subscribe: subscribeSettings, emit } = createEmitter({
  onStart: () => window.addEventListener('storage', onStorage),
  onStop: () => window.removeEventListener('storage', onStorage),
});
export { subscribeSettings };

export function getSettings() {
  return state;
}

// `value` may be a functional updater, like a useState setter.
export function setSetting(key, value) {
  const prev = state[key];
  const next = typeof value === 'function' ? value(prev) : value;
  if (Object.is(prev, next)) return;
  state = { ...state, [key]: next };
  persist(state);
  emit();
}

// Another window wrote the key (or cleared storage): reload and notify.
function onStorage(e) {
  if (e.key !== null && e.key !== SETTINGS_KEY) return;
  try {
    const saved = e.key === null ? null : e.newValue;
    state = saved ? sanitize(JSON.parse(saved)) : { ...SETTINGS_DEFAULTS };
  } catch { return; }
  emit();
}

// Setters are created once per key so callers can list them as stable deps.
const setters = {};
export function settingSetter(key) {
  return (setters[key] ||= (value) => setSetting(key, value));
}

// One shared preference: every tab sees the same value, live.
export function useSetting(key) {
  const value = useSyncExternalStore(subscribeSettings, () => state[key]);
  return [value, settingSetter(key)];
}

// A per-tab value seeded from the store. The tab keeps its own live copy and
// every change is written back as the default for the next tab to open.
export function useSeededSetting(key) {
  const [value, setValue] = useState(() => state[key]);
  // Resolve functional updaters against a ref, not inside a setState updater:
  // writing the store there would notify other components mid-render.
  const valueRef = useRef(value);
  const set = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(valueRef.current) : next;
    valueRef.current = resolved;
    setValue(resolved);
    setSetting(key, resolved);
  }, [key]);
  return [value, set];
}
