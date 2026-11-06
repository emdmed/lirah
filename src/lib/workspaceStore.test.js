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
  'nevo-terminal:pinned-files': JSON.stringify([{ path: '/x/a.md', pinnedAt: 1 }]),
  'lirah:token-budgets:v1': JSON.stringify({ version: 1, budgets: { '/x': { dailyLimit: 5 } }, alertStates: {} }),
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
  for (const id of ['w1', 'w2']) { // global pins and budgets copied into every workspace
    expect(disk.get(`workspaces/${id}/workspace.json`).pins).toEqual([{ path: '/x/a.md', pinnedAt: 1 }]);
    expect(disk.get(`workspaces/${id}/workspace.json`).budgets.budgets['/x'].dailyLimit).toBe(5);
  }
  first.setWorkspaceData('w2', 'pins', []);
  first.setWorkspaceData('w2', 'terminalSessions', { b: 's1', gone: 's2' });
  await (await import('./fileStore.js')).flush();
  expect(disk.get('workspaces/w2/workspace.json').terminalSessions).toEqual({ b: 's1' }); // closed tab dropped

  vi.resetModules();
  for (const k of Object.keys(ls)) delete ls[k]; // files alone must be enough
  const second = await import('./workspaceStore.js');
  await second.initWorkspaces();
  const restored = second.getSavedWorkspaces();
  expect(restored.activeWorkspaceId).toBe('w2');
  expect(restored.activeTabId).toBe('b'); // w2 has no activeTabId yet: its first tab
  expect(restored.tabs.map((t) => [t.id, t.workspaceId])).toEqual([['a', 'w1'], ['b', 'w2']]);
  expect(restored.workspaces[0]).toEqual({ id: 'w1', name: 'main', activeTabId: 'a' });
  expect(second.getWorkspaceData('w1', 'pins')).toHaveLength(1);
  expect(second.getWorkspaceData('w2', 'pins')).toEqual([]); // per workspace, not re-seeded
  expect(second.getWorkspaceData('w2', 'terminalSessions')).toEqual({ b: 's1' });
});

it('workspaceListStore seeds the active workspace once and writes only live, changed lists', async () => {
  vi.resetModules();
  const ws = await import('./workspaceStore.js');
  await ws.initWorkspaces(); // w1, w2 from the files above; active w2
  const { flush } = await import('./fileStore.js');
  const store = ws.workspaceListStore('jobs/jobs.json', 'jobs');
  const seeded = await store.load(async () => [{ id: 'j1' }]);
  expect(seeded).toEqual([{ id: 'j1', workspaceId: 'w2' }]);
  store.save([...seeded, { id: 'j2', workspaceId: 'gone' }]);
  await flush();
  expect(disk.get('workspaces/w2/jobs/jobs.json').jobs).toEqual([{ id: 'j1' }]);
  expect(disk.has('workspaces/w1/jobs/jobs.json')).toBe(false); // empty and never written
  expect(disk.has('workspaces/gone/jobs/jobs.json')).toBe(false);
  const again = await ws.workspaceListStore('jobs/jobs.json', 'jobs').load(async () => [{ id: 'old' }]);
  expect(again).toEqual([{ id: 'j1', workspaceId: 'w2' }]); // a file exists: no re-seed
});
