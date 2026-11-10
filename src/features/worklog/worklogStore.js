import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { list } from '../../lib/fileStore';
import { createEmitter } from '../../lib/createStore';
import { git, gitLines, repoTop } from '../../lib/git';

// The work log: every Claude Code prompt, in any repo, with its branch and the
// files it changed. Fed by agentHookState (UserPromptSubmit opens an entry,
// Stop closes it). Stored as one JSON-lines file per month,
// ~/.lirah/worklog/YYYY-MM.jsonl, that is only ever appended to: a "start"
// line when the prompt is sent, an "end" line with the files when the turn
// ends. Appends never overwrite each other across instances, nothing is
// capped, and a crash can cost at most a torn last line, which reading skips.
const DIR = 'worklog';

/** The month file an entry started at `at` goes in (local time). */
export function monthFile(at) {
  const d = new Date(at);
  return `${DIR}/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`;
}

/** A month file's text → its entries, in the order they started. */
export function parseLog(text) {
  const byId = new Map();
  for (const line of text.split('\n')) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue; // blank, or a line torn by a crash
    }
    if (ev?.type === 'start' && ev.id) {
      const { type: _type, ...entry } = ev;
      byId.set(ev.id, { ...entry, files: null });
    } else if (ev?.type === 'end' && byId.has(ev.id)) {
      Object.assign(byId.get(ev.id), { endedAt: ev.at, files: ev.files ?? [] });
    }
  }
  return [...byId.values()];
}

const changes = createEmitter(); // () after this window appended to the log

async function append(rel, ev) {
  try {
    await invoke('store_append', { rel, line: JSON.stringify(ev) });
    changes.emit();
  } catch (e) {
    console.error('Failed to write the work log:', e);
  }
}

/** The entries of the newest `months` month files, oldest first, and whether older ones exist. */
export async function readLog(months) {
  const names = (await list(DIR).catch(() => [])).filter((n) => n.endsWith('.jsonl')).sort();
  const recent = names.slice(-months);
  const texts = await Promise.all(recent.map((n) => invoke('store_read_text', { rel: `${DIR}/${n}` }).catch(() => '')));
  return { entries: texts.flatMap((t) => parseLog(t ?? '')), older: names.length > recent.length };
}

/** `git status --porcelain=v1 -z --no-renames` output → [{ path, gone }]. */
export function parseStatus(out) {
  return out.split('\0').filter(Boolean).map((rec) => ({
    path: rec.slice(3),
    // Deleted from the work tree (unstaged ` D`, or staged `D ` with no file left).
    gone: rec[1] === 'D' || (rec[0] === 'D' && rec[1] === ' '),
  }));
}

/** The repo's HEAD and each dirty file's content hash ('gone' when deleted). */
export async function snapshot(root) {
  const head = (await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).catch(() => '')).trim() || null;
  const dirty = parseStatus(await git(root, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all']));
  const files = new Map(dirty.filter((d) => d.gone).map((d) => [d.path, 'gone']));
  const present = dirty.filter((d) => !d.gone).map((d) => d.path);
  if (present.length) {
    let hashes;
    try {
      hashes = (await git(root, ['hash-object', '--', ...present])).split('\n');
    } catch {
      // One path vanished between status and hash: hash them one by one.
      hashes = await Promise.all(present.map((p) => git(root, ['hash-object', '--', p]).catch(() => 'gone')));
    }
    present.forEach((p, i) => files.set(p, hashes[i].trim()));
  }
  return { head, files };
}

/**
 * Files changed since `before`: a dirty file whose content changed, appeared
 * or went clean, plus what any commits made in between touched. Catches Bash
 * edits (sed -i, mv, rm, codegen) the same as Edit/Write.
 * shortcut: anything else editing the repo meanwhile (another agent, the user) is counted too.
 */
export async function changedSince(root, before) {
  const after = await snapshot(root);
  const changed = new Set();
  for (const p of new Set([...before.files.keys(), ...after.files.keys()])) {
    if (before.files.get(p) !== after.files.get(p)) changed.add(p);
  }
  if (before.head && after.head && before.head !== after.head) {
    for (const p of await gitLines(root, ['diff', '--name-only', before.head, after.head]).catch(() => [])) changed.add(p);
  }
  return changed;
}

const open = new Map(); // sessionId -> Promise<{ id, at, root, base, snap } | null>

/** A prompt was sent in `cwd`: log it, and snapshot the repo to diff at the turn's end. */
export function startEntry(sessionId, { prompt, cwd }) {
  if (typeof prompt !== 'string' || !prompt.trim() || !cwd) return null;
  if (open.has(sessionId)) endEntry(sessionId); // a turn that never got its Stop
  const ctx = (async () => {
    const root = await repoTop(cwd).catch(() => null);
    const snap = root ? snapshot(root).catch(() => null) : null; // first, before the agent edits anything
    // symbolic-ref, not rev-parse: it also names the branch of a repo with no commits yet.
    const branch = root ? (await git(root, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim() || 'detached' : null;
    const base = root || cwd;
    const at = Date.now();
    const id = `${at.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    // repo: the repo root, or the folder outside git. Awaited so the end line always follows it.
    await append(monthFile(at), { type: 'start', id, at, prompt: prompt.trim(), repo: base, cwd, branch });
    return { id, at, root, base, snap };
  })().catch(() => null);
  open.set(sessionId, ctx);
  return ctx;
}

/** The turn ended: record what it changed. `toolEdited` are absolute paths from Edit/Write tools. */
export async function endEntry(sessionId, toolEdited = []) {
  const pending = open.get(sessionId);
  if (!pending) return;
  open.delete(sessionId);
  const edited = [...toolEdited];
  const ctx = await pending;
  if (!ctx) return;
  const before = await ctx.snap;
  const files = before ? await changedSince(ctx.root, before).catch(() => new Set()) : new Set();
  // Edit/Write paths cover files outside the repo, and folders outside git.
  for (const abs of edited) files.add(abs.startsWith(`${ctx.base}/`) ? abs.slice(ctx.base.length + 1) : abs);
  // In the start's month file, so a turn across midnight on the 1st stays whole.
  return append(monthFile(ctx.at), { type: 'end', id: ctx.id, at: Date.now(), files: [...files].sort() });
}

/**
 * The log's newest `months` months (null while loading), oldest first;
 * `older` when there are more, which `loadOlder` adds one at a time; and
 * `repo`: the repo (or folder) of `projectPath`, which entries' `repo` match.
 * Re-read on open and after each append from this window.
 * shortcut: other instances' appends show on the next re-read, not live; watch worklog/ if that matters.
 */
export function useWorklog(projectPath) {
  const [months, setMonths] = useState(2);
  const [log, setLog] = useState({ entries: null, older: false });
  const [repo, setRepo] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let latest = 0; // a slow read must not replace a newer one
    const reread = () => {
      const n = ++latest;
      readLog(months).then((next) => !cancelled && n === latest && setLog(next));
    };
    reread();
    const off = changes.subscribe(reread);
    return () => {
      cancelled = true;
      off();
    };
  }, [months]);
  useEffect(() => {
    let cancelled = false;
    setRepo(null);
    if (projectPath) repoTop(projectPath).catch(() => null).then((root) => !cancelled && setRepo(root || projectPath));
    return () => {
      cancelled = true;
    };
  }, [projectPath]);
  return { ...log, repo, loadOlder: () => setMonths((m) => m + 1) };
}
