import { describe, it, expect, vi, beforeEach } from 'vitest';

const disk = new Map();
const local = new Map();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd, { rel, data }) => {
    if (cmd === 'store_read') return disk.get(rel) ?? null;
    const doc = { ...data, version: 1, revision: (disk.get(rel)?.revision ?? 0) + 1 };
    disk.set(rel, doc);
    return doc;
  },
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested() {} }) }));
globalThis.localStorage = { getItem: (k) => local.get(k) ?? null, setItem: (k, v) => local.set(k, v) };

beforeEach(() => { disk.clear(); local.clear(); vi.resetModules(); });
const fresh = () => import('./settingsStore.js');

describe('settingsStore', () => {
  it('seeds settings.json from localStorage and keeps the old key', async () => {
    local.set('lirah:settings:v1', JSON.stringify({ scrollback: 500, figures: 'compact' }));
    const s = await fresh();
    await s.initSettings();
    expect(disk.get('settings.json')).toMatchObject({ scrollback: 500, figures: 'compact', revision: 1 });
    expect(local.has('lirah:settings:v1')).toBe(true);
  });

  it('prefers settings.json over localStorage and saves changes to it', async () => {
    local.set('lirah:settings:v1', JSON.stringify({ scrollback: 500 }));
    disk.set('settings.json', { scrollback: 900, version: 1, revision: 3 });
    const s = await fresh();
    await s.initSettings();
    expect(s.getSettings().scrollback).toBe(900);
    s.setSetting('scrollback', 1200);
    const { flush } = await import('../../lib/fileStore.js');
    await flush();
    expect(disk.get('settings.json')).toMatchObject({ scrollback: 1200, revision: 4 });
  });

  it('copies moved keys into an existing settings.json once, keeping the old keys', async () => {
    const bm = [{ id: 'b1', name: 'repo', path: '/r' }];
    local.set('nevo-terminal:project-bookmarks', JSON.stringify(bm));
    local.set('nevo-terminal:prompt-templates', JSON.stringify([{ id: 't1', title: 'T', content: 'C' }]));
    local.set('lirah:plan-contexts:v1', JSON.stringify({ contexts: [{ id: 'c', name: 'N', text: 'X' }], defaultId: 'c' }));
    local.set('nevo-theme', 'rivendell');
    local.set('nevo-terminal:selected-cli', 'opencode');
    disk.set('settings.json', { scrollback: 900, selectedCli: 'claude-code', version: 1, revision: 1 });
    const s = await fresh();
    await s.initSettings();
    const got = s.getSettings();
    expect(got.bookmarks).toEqual(bm);
    expect(got.promptTemplates[0].id).toBe('t1');
    expect(got.planContexts.defaultId).toBe('c');
    expect(got.theme).toBe('rivendell');
    expect(got.selectedCli).toBe('claude-code'); // present in the file: not overwritten
    expect(local.has('nevo-theme')).toBe(true);
    s.setSetting('theme', 'tokyo-night');
    const { flush } = await import('../../lib/fileStore.js');
    await flush();
    expect(disk.get('settings.json')).toMatchObject({ theme: 'tokyo-night', bookmarks: bm });
  });

  it('drops invalid entries of the moved fields', async () => {
    disk.set('settings.json', { bookmarks: [{ id: 'x', name: '', path: '/r' }], planContexts: { contexts: [] }, version: 1, revision: 1 });
    const s = await fresh();
    await s.initSettings();
    expect(s.getSettings().bookmarks).toEqual([]);
    expect(s.getSettings().planContexts).toEqual(s.SETTINGS_DEFAULTS.planContexts);
  });

  it('resolves defaults, then settings.json, then workspace overrides', async () => {
    disk.set('settings.json', { sandboxEnabled: true, autoLaunchCli: false, scrollback: 900, version: 1, revision: 1 });
    disk.set('workspaces/index.json', { workspaces: ['w1'], activeWorkspaceId: 'w1', version: 1, revision: 1 });
    disk.set('workspaces/w1/workspace.json', {
      id: 'w1', name: 'main', tabs: [], version: 1, revision: 1,
      overrides: { sandboxEnabled: false, selectedCli: 'opencode', scrollback: 5, autoLaunchCli: 'yes' },
    });
    const s = await fresh();
    await s.initSettings();
    await (await import('../../lib/workspaceStore.js')).initWorkspaces();
    const eff = s.getEffectiveSettings('w1');
    expect(eff.sandboxEnabled).toBe(false); // override wins over settings.json
    expect(eff.selectedCli).toBe('opencode'); // override wins over the default
    expect(eff.scrollback).toBe(900); // not overridable: ignored
    expect(eff.autoLaunchCli).toBe(false); // wrong type: settings.json kept
    expect(eff.networkIsolation).toBe(false); // code default
    expect(s.getEffectiveSettings('other')).toBe(s.getSettings());
  });
});
