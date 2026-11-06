// One-time imports of data kept in older ~/.lirah layouts. migrations.json
// lists the ones done; the old files are never changed and stay as a backup.
import { list, load, save } from './fileStore';
import { getSavedWorkspaces } from './workspaceStore';

const MARKER = 'migrations.json';

const inside = (path, root) => path === root || path?.startsWith(`${root.replace(/\/$/, '')}/`);

// The first workspace with a tab in the repo, else the first workspace.
function workspaceFor(repo, { workspaces, tabs }) {
  const tab = repo && tabs.find((t) => inside(t.projectPath, repo) && workspaces.some((w) => w.id === t.workspaceId));
  return tab?.workspaceId ?? workspaces[0].id;
}

// Old per-repo folders: tasks/<folder>-<hash>/tasks.json and plans/<repo>-<hash>/plans.json.
async function oldDocs(dir, file) {
  const names = await list(dir).catch(() => []);
  const docs = await Promise.all(names.map((n) => load(`${dir}/${n}/${file}`).catch(() => null)));
  return docs.filter(Boolean);
}

async function repoFilesToWorkspaces(state) {
  for (const doc of await oldDocs('tasks', 'tasks.json')) {
    const old = Array.isArray(doc.tasks) ? doc.tasks : [];
    if (!old.length) continue;
    const ws = workspaceFor(doc.scope, state);
    const rel = `workspaces/${ws}/tasks.json`;
    const merge = (cur) => {
      const tasks = Array.isArray(cur?.tasks) ? cur.tasks : [];
      const ids = new Set(tasks.map((t) => t.id));
      const added = old.filter((t) => !ids.has(t.id)).map((t) => ({ ...t, repos: t.repos ?? (doc.scope ? [doc.scope] : []) }));
      return { scope: ws, tasks: [...tasks, ...added] };
    };
    const cur = await load(rel);
    await save(rel, (c) => merge(c === undefined ? cur : c));
  }
  for (const doc of await oldDocs('plans', 'plans.json')) {
    const ws = workspaceFor(doc.repoRoot, state);
    for (const plan of Array.isArray(doc.plans) ? doc.plans : []) {
      const repoRoot = plan?.repoRoot ?? doc.repoRoot;
      if (!plan?.id || !repoRoot) continue;
      const rel = `workspaces/${ws}/plans/${plan.id}/plan.json`;
      if (await load(rel)) continue; // never overwrite a plan that is already there
      await save(rel, { ...plan, repoRoot, workspaceId: ws });
    }
  }
}

const MIGRATIONS = { repoFilesToWorkspaces };

/** Run the migrations not done yet. Call after initWorkspaces, before the task and plan stores load. */
export async function runMigrations() {
  const state = getSavedWorkspaces();
  if (!state.workspaces.length) return; // nowhere to put the data yet; try next start
  try {
    const done = (await load(MARKER))?.done ?? [];
    for (const [name, run] of Object.entries(MIGRATIONS)) {
      if (done.includes(name)) continue;
      await run(state);
      done.push(name);
      await save(MARKER, { done });
    }
  } catch (error) {
    console.error('Migration failed, will retry next start:', error);
  }
}
