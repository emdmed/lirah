import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { createEmitter } from '../../lib/createStore';
import { load as loadFile, onExternalChange, save as saveFile } from '../../lib/fileStore';
import { getWorkspaceData, setWorkspaceData } from '../../lib/workspaceStore';
import { getLastAnyOutputAt } from '../tabs/terminalActivity';

// App preferences in one module-level store, persisted to ~/.lirah/settings.json.
// The old localStorage blob (SETTINGS_KEY) only seeds that file on first start
// and is then left alone as a backup.
//
// Every tab reads it through useSyncExternalStore, so a change made in one tab
// reaches every other open tab in the same render.
//
// A few values are "seeded" rather than shared (see useSeededSetting): the
// store holds the default a new tab starts with, but each tab keeps its own
// live copy because the value is bound to that tab's running process (sandbox,
// network isolation, CLI) or layout (sidebar, file view).

export const SETTINGS_KEY = 'lirah:settings:v1';
export const SETTINGS_FILE = 'settings.json';

export const SETTINGS_DEFAULTS = {
  sandboxEnabled: false,
  networkIsolation: false,
  showTitleBar: true,
  // Window-wide: hide the panes and top rail, leaving the terminal and Zen's own chrome.
  zenMode: false,
  // Zen's strip shows only its name row; the turn row's height stays reserved.
  zenStripFolded: false,
  keepFilesAfterSend: false,
  // Launch the CLI automatically when a starred (bookmarked) repo is opened.
  // Never applies to tabs restored at startup: that isn't a deliberate act.
  autoLaunchCli: true,
  selectedCli: 'claude-code',
  // Command that starts Claude Code in a tab; empty = `claude`, or npx when it isn't on PATH.
  claudeCommand: '',
  // Lirah's agent hooks. Agent state: the agent reports working / permission /
  // done to its tab. Compaction: lets a tab switch on the compaction hook.
  agentStateHook: true,
  compactionHook: true,
  autoChangelogEnabled: false,
  autoChangelogTarget: 'CHANGELOG.md',
  autoChangelogTrigger: 'commit',
  autoChangelogCli: 'claude-code',
  autoCommitCli: 'claude-code',
  autoCommitCustomPrompt: '',
  sidebarOpen: true,
  sidebarWidth: 280,
  viewMode: 'flat',
  // The files pane's section ('tabs' | 'files') and, under files, the tree or the feature map.
  sidebarSection: 'tabs',
  filesPanel: 'tree',
  // Terminal scrollback in lines (see lib/terminalPrefs.js).
  scrollback: 10000,
  // New tabs open the full prompt box instead of the one-line context status.
  promptBoxOnStart: false,
  // Per tab, seeded: whether the prompt's context list is open.
  contextChipsOpen: true,
  // The right sidebar: its dragged width (0 until dragged) and half-window mode.
  jobsSidebarWidth: 0,
  jobsSidebarWide: false,
  // The auto-pilot confirm has shown its first-run tip.
  autopilotTipSeen: false,
  // What opens at launch: 'restore' reopens the last session's tabs,
  // 'projects' opens startupProjects instead.
  startupMode: 'restore',
  // Items are { path, name?, launch? }; launch starts the CLI in that tab.
  startupProjects: [],
  // The agent in a tab may drive Lirah through the `lirah` CLI.
  agentControl: true,
  // Folders of tools and skills given to Claude Code, each with a prompt.
  // Items are { id, name, folder, prompt, enabled } (see PluginsRow).
  plugins: [],
  // The plan menu's choice: a task's plan is imported and split into chunks
  // once the agent has written it (git repos only), or left as a file.
  autoChunkTaskPlans: true,
  // The plan menu's other choice: the plan is one .md file, or a draft folder of them.
  draftTaskPlans: false,
  // How a model rewrites a saved task; empty = a user story (see tasks/taskModel.js).
  taskFormatPrompt: '',
  // The model the work log pane summarizes with: 'haiku', 'sonnet' or 'opus'.
  worklogSummaryModel: 'haiku',
  // 'full' draws figures with scales, boxed values and leaders; 'compact'
  // keeps their marks only, with the values in the tooltip.
  figures: 'full',
  // Starred repos: { id, name, path, createdAt, lastAccessedAt }.
  bookmarks: [],
  // Saved prompts: { id, title, content, createdAt, updatedAt }.
  promptTemplates: [],
  // Instructions put in front of a task sent to plan (see tasks/planContexts.js).
  planContexts: {
    contexts: [{ id: 'ctx-plan', name: 'Plan', text: 'Write a full implementation plan for this task.' }],
    defaultId: 'ctx-plan',
  },
  // A key of themes/theme-config.js; ThemeContext falls back on an unknown one.
  theme: 'tokyo-night',
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

// Kept in keys of their own until after v1 shipped, so they are read whenever
// the blob doesn't have them yet, not only on the first load. Each parses the
// old raw string; undefined keeps the default.
const LATER_KEYS = {
  scrollback: ['nevo-terminal:scrollback', (raw) => {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }],
  contextChipsOpen: ['lirah:contextChipsOpen', (raw) => raw !== 'false'],
  jobsSidebarWidth: ['agentJobsSidebarWidth', (raw) => {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }],
  jobsSidebarWide: ['agentJobsSidebarWide', (raw) => raw === '1'],
  autopilotTipSeen: ['lirah:autopilot-tip-seen', (raw) => raw === '1'],
  // Moved into settings.json in its file era: copied while the field is absent.
  bookmarks: ['nevo-terminal:project-bookmarks', JSON.parse],
  promptTemplates: ['nevo-terminal:prompt-templates', JSON.parse],
  planContexts: ['lirah:plan-contexts:v1', JSON.parse],
  theme: ['nevo-theme', (raw) => raw || undefined],
  selectedCli: ['nevo-terminal:selected-cli', (raw) => raw || undefined],
};

// The later keys `raw` (a saved blob, or {}) is missing, from their old keys.
function readLater(raw) {
  const found = {};
  for (const [key, [legacyKey, parse]] of Object.entries(LATER_KEYS)) {
    if (raw && key in raw) continue;
    try {
      const saved = localStorage.getItem(legacyKey);
      const value = saved === null ? undefined : parse(saved);
      if (value !== undefined) found[key] = value;
    } catch { /* storage unavailable: keep the default */ }
  }
  return found;
}

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

function cleanBookmarks(v) {
  return Array.isArray(v)
    ? v.filter((b) => b && typeof b.id === 'string' && nonEmpty(b.name) && nonEmpty(b.path))
    : undefined;
}

function cleanTemplates(v) {
  return Array.isArray(v)
    ? v.filter((t) => t && typeof t.id === 'string' && nonEmpty(t.title) && nonEmpty(t.content))
    : undefined;
}

// Undefined (the default seed) when no context is usable: there is always one.
export function cleanPlanContexts(v) {
  const contexts = Array.isArray(v?.contexts)
    ? v.contexts.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.text === 'string')
    : [];
  if (contexts.length === 0) return undefined;
  const defaultId = contexts.some((c) => c.id === v.defaultId) ? v.defaultId : contexts[0].id;
  return { contexts, defaultId };
}

const STARTUP_MODES = ['restore', 'projects'];

// One startup project, cleaned: undefined if it has no usable path.
function cleanStartupProject(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  if (typeof item.path !== 'string' || !item.path.trim()) return undefined;
  const out = { path: item.path };
  if (typeof item.name === 'string') out.name = item.name;
  if (typeof item.launch === 'boolean') out.launch = item.launch;
  return out;
}

// One user plugin, cleaned: undefined if it has no folder.
function cleanPlugin(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  if (typeof item.folder !== 'string' || !item.folder.trim()) return undefined;
  const base = item.folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'plugin';
  return {
    id: typeof item.id === 'string' && item.id ? item.id : base,
    name: typeof item.name === 'string' && item.name.trim() ? item.name : base,
    folder: item.folder,
    prompt: typeof item.prompt === 'string' ? item.prompt : '',
    enabled: item.enabled !== false,
  };
}

// Keys whose value needs more than a type check. Each returns the cleaned
// value, or undefined to keep the default.
const VALIDATORS = {
  startupMode: (v) => (STARTUP_MODES.includes(v) ? v : undefined),
  startupProjects: (v) => (Array.isArray(v)
    ? v.map(cleanStartupProject).filter(Boolean)
    : undefined),
  plugins: (v) => (Array.isArray(v) ? v.map(cleanPlugin).filter(Boolean) : undefined),
  figures: (v) => (v === 'full' || v === 'compact' ? v : undefined),
  sidebarSection: (v) => (v === 'tabs' || v === 'files' ? v : undefined),
  filesPanel: (v) => (v === 'tree' || v === 'features' ? v : undefined),
  bookmarks: cleanBookmarks,
  promptTemplates: cleanTemplates,
  planContexts: cleanPlanContexts,
};

// Keep only known keys whose type matches the default, so a corrupt or
// hand-edited blob can't put a string where a boolean belongs. Invalid keys
// keep their value from `base`.
export function sanitize(raw, base = SETTINGS_DEFAULTS) {
  const out = { ...base };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(SETTINGS_DEFAULTS)) {
    if (!(key in raw)) continue;
    const validate = VALIDATORS[key];
    if (validate) {
      const value = validate(raw[key]);
      if (value !== undefined) out[key] = value;
    } else if (typeof raw[key] === typeof SETTINGS_DEFAULTS[key]) {
      out[key] = raw[key];
    }
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
  return raw;
}

function persist(next) {
  saveFile(SETTINGS_FILE, next, { debounce: 300 })
    .catch((error) => console.warn(`Failed to save ${SETTINGS_FILE}:`, error));
}

// The pre-file settings from localStorage: the v1 blob, else the older keys.
function loadLocal() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved !== null) {
      const raw = JSON.parse(saved);
      return sanitize({ ...raw, ...readLater(raw) });
    }
  } catch { /* corrupt blob or storage unavailable: fall through */ }
  return sanitize({ ...readLegacy(), ...readLater({}) });
}

// Until initSettings resolves (or outside Tauri) this is the localStorage copy.
let state = loadLocal();
const { subscribe: subscribeSettings, emit } = createEmitter();
export { subscribeSettings };

/** Load settings.json, seeding it from localStorage when missing. Await before render. */
export async function initSettings() {
  try {
    const doc = await loadFile(SETTINGS_FILE);
    if (doc) state = sanitize({ ...doc, ...readLater(doc) });
    else await saveFile(SETTINGS_FILE, state);
  } catch (error) {
    console.warn(`Failed to load ${SETTINGS_FILE}, using localStorage:`, error);
  }
}

// An edit from outside (`lirah settings set`, `lirah theme`) replaces the state.
onExternalChange((rel) => rel === SETTINGS_FILE, (doc) => {
  if (!doc) return;
  state = sanitize({ ...doc, ...readLater(doc) });
  emit();
});

export function getSettings() {
  return state;
}

// Settings a workspace may set over settings.json, in workspace.json `overrides`.
// Budgets are per-workspace data already (workspace.json `budgets`), not a setting.
export const OVERRIDABLE_KEYS = ['selectedCli', 'sandboxEnabled', 'networkIsolation', 'autoLaunchCli', 'startupMode'];

/** Code defaults, then settings.json, then the workspace's overrides (other keys ignored). */
export function getEffectiveSettings(workspaceId) {
  const overrides = workspaceId ? getWorkspaceData(workspaceId, 'overrides') : null;
  if (!overrides || typeof overrides !== 'object') return state;
  const picked = Object.fromEntries(OVERRIDABLE_KEYS.filter((k) => k in overrides).map((k) => [k, overrides[k]]));
  // An override of the wrong type is dropped, leaving the settings.json value.
  return Object.keys(picked).length ? sanitize(picked, state) : state;
}

/** The workspace's override for key, or undefined when it follows settings.json. */
export function getOverride(workspaceId, key) {
  return getWorkspaceData(workspaceId, 'overrides')?.[key];
}

/** Set a workspace override; undefined removes it (back to settings.json). */
export function setOverride(workspaceId, key, value) {
  if (!OVERRIDABLE_KEYS.includes(key)) return;
  const { [key]: _, ...rest } = getWorkspaceData(workspaceId, 'overrides') ?? {};
  setWorkspaceData(workspaceId, 'overrides', value === undefined ? rest : { ...rest, [key]: value });
  emit();
}

// Writes the override when the workspace has one for key, else settings.json.
function setEffective(workspaceId, key, value) {
  if (workspaceId && getOverride(workspaceId, key) !== undefined) {
    const next = typeof value === 'function' ? value(getEffectiveSettings(workspaceId)[key]) : value;
    setOverride(workspaceId, key, next);
  } else setSetting(key, value);
}

// `value` may be a functional updater, like a useState setter.
export function setSetting(key, value) {
  const prev = state[key];
  const next = typeof value === 'function' ? value(prev) : value;
  if (Object.is(prev, next)) return;
  state = { ...state, [key]: next };
  persist(state);
  if (key === 'zenMode') zenShift(next);
  else emit();
}

// Zen on/off swaps the whole layout under the boot splash (index.html), worn as
// a bare veil in the terminal's colour. It covers fast while the arrival hairline
// draws over the edge the chrome folds into (the bottom line's going in, the top
// rail's coming out), the layout swaps and the terminals repaint behind it, then
// it reveals slowly. The state is already set, so a second toggle while covered
// just re-renders under the same veil.
const SPLASH_IN_MS = 120;
const SPLASH_OUT_MS = 280;
const RULE_MS = 200; // the hairline's draw, from the alt-Z chord's side
// The chrome's own edge rule: the Zen line's top pixel, the top rail's bottom one (both h-8).
const CHROME_EDGE = '31px';
// The hold ends once the terminals have gone quiet after the SIGWINCH repaint:
// at least HOLD_MIN (so the hairline finishes), QUIET with no output, never past HOLD_MAX.
const HOLD_MIN_MS = RULE_MS - SPLASH_IN_MS;
const HOLD_QUIET_MS = 60;
const HOLD_MAX_MS = 320;
let zenPhase = null; // 'covering' | 'covered'
let fadeId = 0; // a newer fade stops the older one's frame loop

const easeOut = (k) => 1 - (1 - k) ** 2;
const expoOut = (k) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k));

// Stepped per frame, not CSS: WebKitGTK paints the last frame of a CSS opacity
// transition at its start value, so a CSS fade flashes the veil once at each end.
function fadeSplash(el, from, to, ms, rule) {
  const id = ++fadeId;
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      if (id !== fadeId) return resolve();
      const k = Math.min(1, (now - t0) / ms);
      el.style.opacity = String(from + (to - from) * easeOut(k));
      if (rule) rule((now - t0) / RULE_MS);
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function terminalsSettled(rule) {
  const t0 = Date.now();
  const p0 = performance.now() - SPLASH_IN_MS;
  return new Promise((resolve) => {
    const check = () => {
      const now = Date.now();
      rule((performance.now() - p0) / RULE_MS);
      const quiet = now - Math.max(t0, getLastAnyOutputAt()) >= HOLD_QUIET_MS;
      if ((now - t0 >= HOLD_MIN_MS && quiet) || now - t0 >= HOLD_MAX_MS) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

async function zenShift(on) {
  const splash = typeof document !== 'undefined' && document.getElementById('splash');
  if (!splash) return emit();
  if (zenPhase === 'covering') return; // the pending emit reads the latest state
  if (zenPhase === 'covered') return emit();
  zenPhase = 'covering';
  const root = document.documentElement;
  root.dataset.zenShift = on ? 'in' : 'out';
  const line = splash.querySelector('.zen-rule');
  line.style.top = on ? 'auto' : CHROME_EDGE;
  line.style.bottom = on ? CHROME_EDGE : 'auto';
  // Reduced motion: the hairline is drawn whole and only the veil fades.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rule = (k) => { line.style.transform = `scaleX(${still ? 1 : expoOut(Math.min(1, k))})`; };
  // Caught mid-reveal, it covers again from where it is.
  const from = splash.hidden ? 0 : Number(splash.style.opacity) || 0;
  rule(0);
  splash.style.transition = 'none';
  splash.style.opacity = String(from);
  splash.classList.remove('is-done', 'is-ready');
  splash.classList.add('is-zen');
  splash.hidden = false;
  await fadeSplash(splash, from, 1, SPLASH_IN_MS, rule);
  zenPhase = 'covered';
  emit();
  await terminalsSettled(rule);
  rule(1);
  zenPhase = null;
  await fadeSplash(splash, 1, 0, SPLASH_OUT_MS);
  if (zenPhase) return; // a new shift took the veil
  splash.hidden = true;
  delete root.dataset.zenShift;
}

// Setters are created once per key so callers can list them as stable deps.
const setters = {};
export function settingSetter(key) {
  return (setters[key] ||= (value) => setSetting(key, value));
}

// One shared preference: every tab sees the same value, live. With a
// workspaceId it reads the effective value (that workspace's override wins)
// and writes the override while one is set.
export function useSetting(key, workspaceId) {
  const value = useSyncExternalStore(subscribeSettings, () => (workspaceId ? getEffectiveSettings(workspaceId) : state)[key]);
  const set = useCallback((v) => setEffective(workspaceId, key, v), [workspaceId, key]);
  return [value, workspaceId ? set : settingSetter(key)];
}

// A per-tab value seeded from the store (the effective value, given a
// workspaceId). The tab keeps its own live copy and every change is written
// back as the default for the next tab to open.
export function useSeededSetting(key, workspaceId) {
  const [value, setValue] = useState(() => (workspaceId ? getEffectiveSettings(workspaceId) : state)[key]);
  // Resolve functional updaters against a ref, not inside a setState updater:
  // writing the store there would notify other components mid-render.
  const valueRef = useRef(value);
  const set = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(valueRef.current) : next;
    valueRef.current = resolved;
    setValue(resolved);
    setEffective(workspaceId, key, resolved);
  }, [workspaceId, key]);
  return [value, set];
}
