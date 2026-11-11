import { it, expect, vi } from 'vitest';

const disk = new Map();
const writes = [];
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested() {} }) }));
const files = new Map(); // absolute path -> text, outside the store
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd, { rel, data, path, content } = {}) => {
    if (cmd === 'start_lirah_watcher') return null;
    if (cmd === 'get_home_dir') return '/h';
    if (cmd === 'path_exists') return files.has(path);
    if (cmd === 'read_file_content') {
      if (path.startsWith('/h/.lirah/')) return JSON.stringify(disk.get(path.slice(10)) ?? null);
      if (!files.has(path)) throw new Error('missing');
      return files.get(path);
    }
    if (cmd === 'write_file_content') { files.set(path, content); return null; }
    if (cmd === 'read_directory') {
      const names = [...new Set([...files.keys()].filter((k) => k.startsWith(`${path}/`)).map((k) => k.slice(path.length + 1).split('/')[0]))];
      return names.map((name) => ({ name, path: `${path}/${name}`, is_dir: !name.includes('.') }));
    }
    if (cmd === 'store_read') return disk.get(rel) ?? null;
    if (cmd === 'store_list') {
      return [...new Set([...disk.keys()].filter((k) => k.startsWith(`${rel}/`)).map((k) => k.slice(rel.length + 1).split('/')[0]))].sort();
    }
    writes.push(rel);
    const doc = { ...data, version: 1, revision: (disk.get(rel)?.revision ?? 0) + 1 };
    disk.set(rel, doc);
    return doc;
  },
}));
vi.mock('./workspaceStore', () => ({
  getSavedWorkspaces: () => ({
    workspaces: [{ id: 'w1' }, { id: 'w2' }],
    tabs: [{ id: 'a', projectPath: '/home/x/other', workspaceId: 'w1' }, { id: 'b', projectPath: '/home/x/api/src', workspaceId: 'w2' }],
  }),
}));

const oldTasks = { version: 1, scope: '/home/x/api', tasks: [{ id: 't1', title: 'kept' }, { id: 't2', title: 'new' }] };
const oldPlans = { version: 1, repoRoot: '/home/x/api', plans: [{ id: 'p1', title: 'existing' }, { id: 'p2', title: 'new' }] };
const orphan = { version: 1, scope: '/home/x/nowhere', tasks: [{ id: 't3', title: 'orphan' }] };
disk.set('tasks/api-1234/tasks.json', oldTasks);
disk.set('tasks/nowhere-5678/tasks.json', orphan);
disk.set('tasks/global.json', { tasks: [{ id: 'g' }] });
disk.set('plans/api-1234/plans.json', oldPlans);
disk.set('workspaces/w2/tasks.json', { scope: 'w2', tasks: [{ id: 't1', title: 'edited' }], revision: 3 });
const nov = new Date(2026, 10, 5).getTime();
disk.set('workspaces/w2/plans/p1/plan.json', { id: 'p1', title: 'edited', repoRoot: '/home/x/api', revision: 2 });
disk.set('workspaces/w1/plans/p3/plan.json', {
  id: 'p3', title: 'old copy', repoRoot: '/home/x/api', createdAt: nov, updatedAt: 1,
  importedFrom: { path: '/home/x/api/p3_plan.md', hash: 'h' },
  chunks: [{ id: 'c1', prompts: [{ kind: 'chunk', file: '/h/.lirah/workspaces/w1/plans/p3/prompts/1-chunk-9.md' }] }],
});
disk.set('workspaces/w1/plans/p3/prompts/1-chunk-9.md', { text: 'sent' });
files.set('/home/x/api/p3_plan.md', '# P3');
// Newer copy in the repo, and one plan only there.
files.set('/home/x/api/lirah/plans/p3/plan.json', JSON.stringify({ id: 'p3', title: 'repo copy', repoRoot: '/home/x/api', createdAt: nov, updatedAt: 5, importedFrom: { path: '/home/x/api/p3_plan.md', hash: 'h' }, chunks: [{ id: 'c1', prompts: [{ kind: 'chunk', file: '/h/.lirah/workspaces/w1/plans/p3/prompts/1-chunk-9.md' }] }] }));
files.set('/home/x/api/lirah/plans/p4/plan.json', JSON.stringify({ id: 'p4', title: 'repo only', repoRoot: '/home/x/api', createdAt: nov }));

it('moves old per-repo tasks and plans into workspaces once, merging and leaving old files', async () => {
  const isNew = (k) => k.startsWith('workspaces/') || /^plans\/\d{4}-\d{2}\//.test(k) || k === 'migrations.json';
  const before = JSON.stringify([...disk.entries()].filter(([k]) => !isNew(k)));
  const { runMigrations } = await import('./migrations.js');
  await runMigrations();

  // repo has a tab in w2: merged there, existing task and plan not overwritten
  expect(disk.get('workspaces/w2/tasks.json').tasks).toEqual([
    { id: 't1', title: 'edited' },
    { id: 't2', title: 'new', repos: ['/home/x/api'] },
  ]);
  expect(disk.get('workspaces/w2/plans/p1/plan.json').title).toBe('edited');
  expect(disk.get('workspaces/w2/plans/p2/plan.json')).toMatchObject({ title: 'new', repoRoot: '/home/x/api', workspaceId: 'w2' });
  // no tab in that repo: first workspace
  expect(disk.get('workspaces/w1/tasks.json').tasks.map((t) => t.id)).toEqual(['t3']);
  // old files untouched
  expect(JSON.stringify([...disk.entries()].filter(([k]) => !isNew(k)))).toBe(before);
  expect(writes.every(isNew)).toBe(true);

  // plans end up in plans/<YYYY-MM>/<id>, the newer copy winning, with the .md and prompt log copied in
  const p3 = disk.get('plans/2026-11/p3/plan.json');
  expect(p3.title).toBe('repo copy');
  expect(p3.importedFrom.path).toBe('/h/.lirah/plans/2026-11/p3_plan.md');
  expect(files.get('/h/.lirah/plans/2026-11/p3_plan.md')).toBe('# P3');
  expect(p3.chunks[0].prompts[0].file).toBe('/h/.lirah/plans/2026-11/p3/prompts/1-chunk-9.md');
  expect(files.has('/h/.lirah/plans/2026-11/p3/prompts/1-chunk-9.md')).toBe(true);
  expect(disk.get('plans/2026-11/p4/plan.json').title).toBe('repo only');
  expect([...disk.keys()].some((k) => /^plans\/\d{4}-\d{2}\/p1\/plan\.json$/.test(k))).toBe(true);
  expect(files.get('/home/x/api/p3_plan.md')).toBe('# P3'); // repo file left as a backup

  writes.length = 0;
  await runMigrations();
  expect(writes).toEqual([]); // second run does nothing
});
