import { it, expect, vi } from 'vitest';

const disk = new Map();
const repos = new Set(['/home/x/api']);
const writes = [];
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested() {} }) }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd, { base, rel: r, data, path, repoRoot }) => {
    if (cmd === 'path_exists') return repos.has(path);
    if (cmd === 'watch_repo_plans') return `${repoRoot}/lirah/plans`;
    const rel = base ? `${base}/${r}` : r;
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
disk.set('workspaces/w2/plans/p1/plan.json', { id: 'p1', title: 'edited', repoRoot: '/home/x/api', revision: 2 });
disk.set('workspaces/w1/plans/p3/plan.json', { id: 'p3', title: 'gone repo', repoRoot: '/home/x/gone', revision: 1 });
disk.set('/home/x/api/lirah/plans/p1/plan.json', { id: 'p1', title: 'repo copy', revision: 4 });

it('moves old per-repo tasks and plans into workspaces once, merging and leaving old files', async () => {
  const before = JSON.stringify([...disk.entries()].filter(([k]) => !k.startsWith('workspaces/') && !k.startsWith('/')));
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
  expect(JSON.stringify([...disk.entries()].filter(([k]) => !k.startsWith('workspaces/') && !k.startsWith('/') && k !== 'migrations.json'))).toBe(before);
  expect(writes.every((rel) => /^(workspaces\/|migrations\.json|\/home\/x\/api\/lirah\/plans\/)/.test(rel))).toBe(true);

  // plansToRepos: copies into the repo, skips an existing repo plan and a missing repo, keeps the originals
  expect(disk.get('/home/x/api/lirah/plans/p2/plan.json')).toMatchObject({ title: 'new', repoRoot: '/home/x/api', workspaceId: 'w2' });
  expect(disk.get('/home/x/api/lirah/plans/p1/plan.json').title).toBe('repo copy');
  expect([...disk.keys()].some((k) => k.startsWith('/home/x/gone'))).toBe(false);
  expect(disk.get('workspaces/w2/plans/p1/plan.json')).toMatchObject({ title: 'edited', revision: 2 });
  expect(disk.get('workspaces/w1/plans/p3/plan.json')).toMatchObject({ title: 'gone repo', revision: 1 });

  writes.length = 0;
  await runMigrations();
  expect(writes).toEqual([]); // second run does nothing
});
