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
});
