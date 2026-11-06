import { it, expect, vi } from 'vitest';

const disk = new Map();
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested() {} }) }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd, { rel, data }) => {
    if (cmd === 'store_read') return disk.get(rel) ?? null;
    const doc = { ...data, version: 1, revision: (disk.get(rel)?.revision ?? 0) + 1 };
    disk.set(rel, doc);
    return doc;
  },
}));

const ls = {
  'nevo-terminal:workspaces': JSON.stringify([{ id: 'w1', name: 'main', lastTabId: 'a' }, { id: 'w2', name: 'side' }]),
  'nevo-terminal:workspaces:active': 'w2',
  'nevo-terminal:tabs': JSON.stringify([
    { id: 'a', projectPath: '/x', label: 'x', workspaceId: 'w1' },
    { id: 'b', projectPath: '/y', label: 'y', workspaceId: 'w2' },
  ]),
  'nevo-terminal:tabs:active': 'b',
};
globalThis.localStorage = { getItem: (k) => ls[k] ?? null, setItem: (k, v) => { ls[k] = v; } };

it('migrates from localStorage, then restores the same state from files', async () => {
  const first = await import('./workspaceStore.js');
  await first.initWorkspaces();
  const migrated = first.getSavedWorkspaces();
  expect(migrated.workspaces.map((w) => w.name)).toEqual(['main', 'side']);
  expect(migrated.tabs).toHaveLength(2);
  await (await import('./fileStore.js')).flush();
  expect(disk.get('workspaces/index.json').workspaces).toEqual(['w1', 'w2']);
  expect(disk.get('workspaces/w1/workspace.json')).toMatchObject({ name: 'main', activeTabId: 'a', tabs: [{ id: 'a', projectPath: '/x' }] });
  expect(ls['nevo-terminal:tabs']).toBeDefined(); // old keys kept

  vi.resetModules();
  for (const k of Object.keys(ls)) delete ls[k]; // files alone must be enough
  const second = await import('./workspaceStore.js');
  await second.initWorkspaces();
  const restored = second.getSavedWorkspaces();
  expect(restored.activeWorkspaceId).toBe('w2');
  expect(restored.activeTabId).toBe('b'); // w2 has no activeTabId yet: its first tab
  expect(restored.tabs.map((t) => [t.id, t.workspaceId])).toEqual([['a', 'w1'], ['b', 'w2']]);
  expect(restored.workspaces[0]).toEqual({ id: 'w1', name: 'main', activeTabId: 'a' });
});
