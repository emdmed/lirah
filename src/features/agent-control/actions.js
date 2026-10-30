// What the `lirah` CLI can do to settings, the theme and tabs. Plain functions over
// the settings store: useAgentControl handles the event, the confirm and the
// toast. Each action returns the reply data, or throws an Error whose message
// goes back to the CLI.

import { getSettings, sanitize, setSetting, SETTINGS_DEFAULTS } from '../settings/settingsStore';
import { SETTINGS_ROWS } from '../settings/settingsSections';
import { TAB_CLIS } from '../../lib/agentClis';
import { SCROLLBACK_OPTIONS } from '../../lib/terminalPrefs';
import { invoke } from '@tauri-apps/api/core';
import { tabDisplayName } from '../tabs/TabContext';
import { getTabSession } from '../tabs/terminalActivity';
import { getAgentHookState } from '../tabs/agentHookState';

// Changes the user confirms first: they loosen the sandbox, change what runs
// inside every agent, or switch this control channel itself.
export const GUARDED_KEYS = new Set([
  'sandboxEnabled', 'networkIsolation', 'agentStateHook', 'compactionHook', 'agentControl',
]);

// Per-tab values: the store only holds the default the next tab starts with.
const SEEDED_KEYS = new Set(['sandboxEnabled', 'networkIsolation', 'selectedCli']);

// Allowed values for choice rows, by settings key.
const CHOICES = {
  selectedCli: TAB_CLIS.map((c) => c.id),
  autoCommitCli: TAB_CLIS.map((c) => c.id),
  scrollback: SCROLLBACK_OPTIONS.map((o) => o.value),
};

// Settings the CLI may touch: those with a row in the Settings dialog.
// startupProjects is a list, edited through its own commands.
export const settingsSchema = Object.fromEntries(
  SETTINGS_ROWS
    .filter((row) => row.key && row.key in SETTINGS_DEFAULTS && row.key !== 'startupProjects')
    .map((row) => {
      const def = SETTINGS_DEFAULTS[row.key];
      const type = CHOICES[row.key] ? 'choice' : typeof def === 'boolean' ? 'bool' : typeof def;
      return [row.key, {
        key: row.key,
        label: row.label,
        section: row.section,
        type,
        default: def,
        ...(CHOICES[row.key] && { values: CHOICES[row.key] }),
        ...(typeof row.hint === 'string' && { hint: row.hint }),
        ...(GUARDED_KEYS.has(row.key) && { guarded: true }),
        ...(SEEDED_KEYS.has(row.key) && { appliesTo: 'new tabs' }),
      }];
    }),
);

export function isGuarded(key) {
  return GUARDED_KEYS.has(key);
}

function schemaFor(key) {
  if (typeof key !== 'string' || !key) throw new Error('missing setting name (see `lirah settings list`)');
  const entry = settingsSchema[key];
  if (!entry) {
    throw new Error(`unknown setting "${key}"; known: ${Object.keys(settingsSchema).join(', ')}`);
  }
  return entry;
}

const BOOL_WORDS = { on: true, true: true, yes: true, 1: true, off: false, false: false, no: false, 0: false };

// Parse a CLI value (a string, or already JSON-parsed by the CLI) for `entry`.
export function parseValue(entry, raw) {
  if (raw === undefined || raw === null || raw === '') {
    throw new Error(`missing value for ${entry.key}`);
  }
  if (entry.type === 'bool') {
    if (typeof raw === 'boolean') return raw;
    const word = String(raw).trim().toLowerCase();
    if (word in BOOL_WORDS) return BOOL_WORDS[word];
    throw new Error(`${entry.key} takes on/off or true/false, not "${raw}"`);
  }
  if (entry.type === 'choice') {
    const numeric = typeof entry.default === 'number';
    const value = numeric ? Number(String(raw).replace(/[,_]/g, '')) : String(raw).trim();
    if (!entry.values.includes(value)) {
      throw new Error(`${entry.key} must be one of ${entry.values.join(', ')}, not "${raw}"`);
    }
    return value;
  }
  if (entry.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${entry.key} takes a number, not "${raw}"`);
    return n;
  }
  return String(raw);
}

// The value as it would be stored, run through the same checks as a loaded
// settings blob so the CLI can't store what a reload would drop.
function cleaned(key, value) {
  const out = sanitize({ [key]: value })[key];
  if (!Object.is(out, value)) throw new Error(`invalid value for ${key}`);
  return out;
}

export function listSettings() {
  const current = getSettings();
  return Object.values(settingsSchema).map((entry) => ({ ...entry, value: current[entry.key] }));
}

export function getSetting(key) {
  const entry = schemaFor(key);
  return getSettings()[entry.key];
}

// Parse and validate without writing, so the caller can confirm first.
// Returns { key, value, previous, changed }.
export function prepareSetting(key, raw) {
  const entry = schemaFor(key);
  const value = cleaned(entry.key, parseValue(entry, raw));
  const previous = getSettings()[entry.key];
  return { key: entry.key, value, previous, changed: !Object.is(previous, value) };
}

export function prepareReset(key) {
  const entry = schemaFor(key);
  const value = SETTINGS_DEFAULTS[entry.key];
  const previous = getSettings()[entry.key];
  return { key: entry.key, value, previous, changed: !Object.is(previous, value) };
}

export function setSettingValue(key, raw) {
  const plan = prepareSetting(key, raw);
  setSetting(plan.key, plan.value);
  return plan;
}

export function resetSetting(key) {
  const plan = prepareReset(key);
  setSetting(plan.key, plan.value);
  return plan;
}

export function listThemes(themes, currentTheme) {
  return Object.entries(themes).map(([id, t]) => ({ id, name: t.name, current: id === currentTheme }));
}

// Accepts the theme id or its display name, case-insensitively.
export function resolveTheme(themes, name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('missing theme name (see `lirah theme list`)');
  const wanted = name.trim().toLowerCase();
  const id = Object.keys(themes).find(
    (k) => k.toLowerCase() === wanted || themes[k].name?.toLowerCase() === wanted,
  );
  if (!id) throw new Error(`unknown theme "${name}"; known: ${Object.keys(themes).join(', ')}`);
  return id;
}

export function setTheme(themes, changeTheme, name) {
  const id = resolveTheme(themes, name);
  changeTheme(id);
  return id;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
// `tabs` is the tab list in bar order; indexes shown to the CLI start at 1.

export function listTabs(tabs, activeTabId, bookmarks, callerTabId) {
  return tabs.map((tab, i) => ({
    index: i + 1,
    id: tab.id,
    name: tabDisplayName(tab, bookmarks),
    path: tab.projectPath,
    active: tab.id === activeTabId,
    ...(tab.id === callerTabId && { caller: true }),
    agent: getAgentHookState(getTabSession(tab.id))?.state || null,
  }));
}

// The tab whose terminal sent the request, or null.
export function callerTab(tabs, sessionId) {
  if (!sessionId) return null;
  return tabs.find((t) => getTabSession(t.id) === sessionId) || null;
}

// A tab by "." (the caller's own), 1-based index, id, or name (case-insensitive).
export function resolveTab(tabs, ref, { sessionId, bookmarks = [] } = {}) {
  const text = ref === undefined || ref === null ? '' : String(ref).trim();
  if (!text) throw new Error('missing tab: give ".", an index, an id or a name (see `lirah tabs`)');
  if (text === '.') {
    const own = callerTab(tabs, sessionId);
    if (!own) throw new Error('"." needs the command to run inside a Lirah tab');
    return own;
  }
  if (/^\d+$/.test(text)) {
    const tab = tabs[Number(text) - 1];
    if (!tab) throw new Error(`no tab ${text}; there are ${tabs.length}`);
    return tab;
  }
  const byId = tabs.find((t) => t.id === text);
  if (byId) return byId;
  const wanted = text.toLowerCase();
  const named = tabs.filter((t) => tabDisplayName(t, bookmarks).toLowerCase() === wanted);
  if (named.length === 1) return named[0];
  if (named.length > 1) {
    throw new Error(`${named.length} tabs are named "${text}"; use an index (${named.map((t) => tabs.indexOf(t) + 1).join(', ')})`);
  }
  throw new Error(`no tab "${text}" (see \`lirah tabs\`)`);
}

// An absolute directory for a new tab. The CLI resolves relative paths against
// its own cwd; "~" is expanded here too for callers that send it raw.
export async function resolveTabPath(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('missing path: lirah tabs open <path>');
  let path = raw.trim();
  if (path === '~' || path.startsWith('~/')) {
    const home = await invoke('get_home_dir');
    path = home + path.slice(1);
  }
  if (!path.startsWith('/')) throw new Error(`path must be absolute, not "${raw}"`);
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (!(await invoke('path_exists', { path }))) throw new Error(`no such directory: ${path}`);
  return path;
}

// ── Startup ──────────────────────────────────────────────────────────────────
// What Lirah opens at launch: 'restore' (the last session's tabs) or
// 'projects' (startupProjects, each { path, name?, launch? }). Entries are
// keyed by path: adding one that is already listed updates it in place.

const STARTUP_MODES = ['restore', 'projects'];

export function getStartup() {
  const { startupMode, startupProjects } = getSettings();
  return { mode: startupMode, projects: startupProjects };
}

// Store `projects` through sanitize() so the CLI can't save what a reload drops.
function saveStartupProjects(projects) {
  const clean = sanitize({ startupProjects: projects }).startupProjects;
  if (clean.length !== projects.length) throw new Error('invalid startup project');
  setSetting('startupProjects', clean);
  return clean;
}

// Returns { mode, previous, changed } without writing.
export function prepareStartupMode(raw) {
  const mode = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!STARTUP_MODES.includes(mode)) {
    throw new Error(`startup mode must be ${STARTUP_MODES.join(' or ')}${raw ? `, not "${raw}"` : ''}`);
  }
  const previous = getSettings().startupMode;
  return { mode, previous, changed: previous !== mode };
}

export function setStartupMode(raw) {
  const plan = prepareStartupMode(raw);
  if (plan.changed) setSetting('startupMode', plan.mode);
  return plan;
}

// Absolute path with "~" expanded and trailing slashes dropped; no existence check.
async function startupPath(raw, usage) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error(`missing path: ${usage}`);
  let path = raw.trim();
  if (path === '~' || path.startsWith('~/')) {
    const home = await invoke('get_home_dir');
    path = home + path.slice(1);
  }
  if (!path.startsWith('/')) throw new Error(`path must be absolute, not "${raw}"`);
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

// Adds a directory, or updates the listed entry for it. `launch` and `name`
// are only changed when given; an empty name clears it.
// Returns { entry, added, projects }.
export async function addStartupProject(raw, { launch, name } = {}) {
  const path = await startupPath(raw, 'lirah startup add <path> [--launch] [--name N]');
  if (!(await invoke('path_exists', { path }))) throw new Error(`no such directory: ${path}`);
  const projects = getSettings().startupProjects;
  const index = projects.findIndex((p) => p.path === path);
  const entry = { ...(index === -1 ? { path } : projects[index]) };
  if (launch !== undefined) {
    if (launch) entry.launch = true;
    else delete entry.launch;
  }
  if (name !== undefined) {
    const label = String(name).trim();
    if (label) entry.name = label;
    else delete entry.name;
  }
  const next = index === -1
    ? [...projects, entry]
    : projects.map((p, i) => (i === index ? entry : p));
  return { entry, added: index === -1, projects: saveStartupProjects(next) };
}

// Returns { removed, projects }; removed is the entry, or null if not listed.
export async function removeStartupProject(raw) {
  const path = await startupPath(raw, 'lirah startup remove <path>');
  const projects = getSettings().startupProjects;
  const removed = projects.find((p) => p.path === path) || null;
  if (!removed) return { removed, projects };
  return { removed, projects: saveStartupProjects(projects.filter((p) => p !== removed)) };
}

// Returns how many entries were dropped.
export function clearStartupProjects() {
  const count = getSettings().startupProjects.length;
  if (count) setSetting('startupProjects', []);
  return count;
}
