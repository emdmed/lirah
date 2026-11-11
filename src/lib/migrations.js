// One-time imports of data kept in older ~/.lirah layouts. migrations.json
// lists the ones done; the old files are never changed and stay as a backup.
import { invoke } from '@tauri-apps/api/core';
import { planMonth } from '../features/plans/planModel';
import { list, load, save } from './fileStore';
import { getSavedWorkspaces } from './workspaceStore';
import { getDraft, saveDraft } from './promptDrafts';
import { loadText } from './storage';
import { splitDirName } from '../utils/pathUtils';

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

// Every plan into plans/<YYYY-MM>/<id>/ (one global folder: a plan may span repos),
// from workspaces/<ws>/plans/<id>/ (with its prompt logs) and from
// <repo>/lirah/plans/<id>/plan.json, where plans briefly lived; the newer copy
// wins. A plan's .md file kept in a repo is copied in and importedFrom points to the copy.
async function plansToGlobal({ workspaces, tabs }) {
  const lirah = `${await invoke('get_home_dir')}/.lirah`;
  const found = new Map(); // id -> { doc, ws }
  const keep = (doc, ws = null) => {
    if (!doc?.id || !doc.repoRoot) return;
    const cur = found.get(doc.id);
    if (!cur || (doc.updatedAt ?? 0) > (cur.doc.updatedAt ?? 0)) found.set(doc.id, { doc, ws: ws ?? cur?.ws ?? null });
  };
  for (const { id: ws } of workspaces) {
    for (const id of await list(`workspaces/${ws}/plans`).catch(() => [])) {
      keep(await load(`workspaces/${ws}/plans/${id}/plan.json`).catch(() => null), ws);
    }
  }
  const repos = new Set([...[...found.values()].map(({ doc }) => doc.repoRoot), ...tabs.map((t) => t.projectPath).filter(Boolean)]);
  for (const repo of repos) {
    const dirs = await invoke('read_directory', { path: `${repo}/lirah/plans` }).catch(() => []);
    for (const dir of dirs.filter((d) => d.is_dir && !d.name.includes('.'))) {
      const text = await invoke('read_file_content', { path: `${dir.path}/plan.json` }).catch(() => null);
      try { keep(text && JSON.parse(text)); } catch { /* broken copy: skip */ }
    }
  }
  const copy = async (from, to) => invoke('write_file_content', { path: to, content: await invoke('read_file_content', { path: from }) });
  for (const { doc, ws } of found.values()) {
    const month = planMonth(doc.createdAt);
    const rel = `plans/${month}/${doc.id}/plan.json`;
    if (await load(rel)) continue; // never overwrite a plan that is already there
    const { version, revision, ...plan } = doc;
    const md = plan.importedFrom?.path;
    if (md && /\.md$/i.test(md) && !md.startsWith(`${lirah}/plans/`) && await invoke('path_exists', { path: md }).catch(() => false)) {
      const { name } = splitDirName(md);
      let to = `${lirah}/plans/${month}/${name}`;
      if (await invoke('path_exists', { path: to }).catch(() => false)) to = `${lirah}/plans/${month}/${name.replace(/\.md$/i, '')}-${plan.id}.md`;
      await copy(md, to);
      plan.importedFrom = { ...plan.importedFrom, path: to };
    }
    if (ws) {
      const from = `workspaces/${ws}/plans/${plan.id}/prompts`;
      const to = `plans/${month}/${plan.id}/prompts`;
      for (const name of await list(from).catch(() => [])) {
        await copy(`${lirah}/${from}/${name}`, `${lirah}/${to}/${name}`).catch((e) => console.warn(`Prompt ${name} not copied:`, e));
      }
      plan.chunks = (plan.chunks ?? []).map((c) => (Array.isArray(c.prompts)
        ? { ...c, prompts: c.prompts.map((p) => (p?.file?.startsWith(`${lirah}/${from}/`) ? { ...p, file: `${lirah}/${to}/${p.file.slice(`${lirah}/${from}/`.length)}` } : p)) }
        : c));
    }
    await save(rel, plan);
  }
}

// The old global last prompt becomes the active tab's draft text, unless it has some.
function lastPromptToDraft({ tabs, activeTabId }) {
  const text = loadText('nevo-terminal:last-prompt');
  const tabId = activeTabId ?? tabs[0]?.id;
  if (!text?.trim() || !tabId) return;
  const draft = getDraft(tabId) ?? {};
  if (!draft.text) saveDraft(tabId, { ...draft, text });
}

const MIGRATIONS = { repoFilesToWorkspaces, lastPromptToDraft, plansToGlobal };

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
