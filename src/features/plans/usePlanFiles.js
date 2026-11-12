import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { hash8 } from '../../lib/ids';
import { DRAFT_DIR, isDraftPath, markdownTitle } from './planPrompts';
import { loadAllPlans, MONTH_DIR } from './usePlanStore';

const DRAFT_FIRST = ['plan.md', 'overview.md', 'readme.md'];

const sortDraft = (files) => {
  const rank = (f) => { const i = DRAFT_FIRST.indexOf(f.name.toLowerCase()); return i < 0 ? DRAFT_FIRST.length : i; };
  return files.filter((f) => /\.md$/i.test(f.name)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
};

/**
 * A draft folder's files ([{ name, text }]) → one plan source: plan.md /
 * overview.md / README.md first, then by name, each after a `<!-- file: -->`
 * line. A title from the folder name goes on top when the first file has none.
 */
export function joinDraft(folder, files) {
  const sorted = sortDraft(files);
  const body = sorted.map((f) => `<!-- file: ${f.name} -->\n${f.text.trim()}`).join('\n\n');
  if (!sorted.length || /^#\s/.test(sorted[0].text.trim())) return body;
  const words = folder.replace(DRAFT_DIR, '').replace(/[_-]+/g, ' ').trim();
  return `# ${words.charAt(0).toUpperCase()}${words.slice(1)}\n\n${body}`;
}

/** A draft folder's .md file paths, in the order they're joined. */
export async function draftFiles(folder) {
  const entries = await invoke('read_directory', { path: folder });
  return sortDraft(entries.filter((e) => !e.is_dir)).map((e) => e.path);
}

/** Opens a draft folder's files in the markdown viewer, first file first; false when it has none. */
export async function openDraftFiles(dialogs, folder) {
  const files = await draftFiles(folder);
  if (files.length === 0) return false;
  dialogs.open('markdown', { filePath: files[0], files }, null);
  return true;
}

/** The plan text at `path`: a .md file as is, or a draft folder's files joined. */
export async function readPlanSource(path) {
  if (!isDraftPath(path)) return invoke('read_file_content', { path });
  const paths = await draftFiles(path);
  const files = await Promise.all(paths.map(async (p) => ({ name: p.split('/').pop(), text: await invoke('read_file_content', { path: p }) })));
  return joinDraft(path.replace(/\/+$/, '').split('/').pop(), files);
}

/**
 * Plan .md files in ~/.lirah/plans/<YYYY-MM>/ (newest month first) not imported
 * yet, or edited since, so they can be imported instead of pasted. The folder
 * is global, so a file imported by any repo's plan counts as imported.
 * Each entry is `new` (never imported) or `changed` (this repo's plan, edited since its import).
 */
export function usePlanFiles({ repoRoot, plans, createPlan, replaceSource }) {
  const [files, setFiles] = useState([]);
  // Rescan only when what was imported changes, not on every chunk update.
  const plansRef = useRef(plans);
  plansRef.current = plans;
  const importedKey = useMemo(
    () => plans && plans.map((p) => (p.importedFrom ? `${p.id}:${p.importedFrom.path}:${p.importedFrom.hash}` : '')).join('|'),
    [plans]
  );

  useEffect(() => {
    if (!repoRoot || importedKey === null) return;
    const plans = plansRef.current;
    let cancelled = false;
    (async () => {
      const list = (path) => invoke('read_directory', { path }).catch(() => []); // a missing folder is fine
      const base = `${await invoke('get_home_dir')}/.lirah/plans`;
      const months = (await list(base)).filter((e) => e.is_dir && MONTH_DIR.test(e.name)).sort((a, b) => b.name.localeCompare(a.name));
      const entries = (await Promise.all(months.map((m) => list(m.path)))).flat()
        .filter((e) => (e.is_dir ? DRAFT_DIR.test(e.name) : /\.md$/i.test(e.name)));
      // Imports made by other repos' plans, read from disk (this repo's are in `plans`).
      const others = new Set([...(await loadAllPlans().catch(() => new Map())).entries()]
        .filter(([root]) => root !== repoRoot)
        .flatMap(([, ps]) => ps.map((p) => p.importedFrom?.path).filter(Boolean)));
      const found = [];
      for (const entry of entries) {
        if (others.has(entry.path)) continue;
        let source;
        try {
          source = await readPlanSource(entry.path);
        } catch {
          continue; // Gone since the listing was cached.
        }
        if (!source.trim()) continue; // A draft folder with no .md files yet.
        const hash = hash8(source);
        const plan = plans.find((p) => p.importedFrom?.path === entry.path);
        if (plan && plan.importedFrom.hash === hash) continue;
        found.push({
          path: entry.path,
          name: entry.name,
          title: markdownTitle(source),
          source,
          hash,
          state: plan ? 'changed' : 'new',
          draft: entry.is_dir ? await draftFiles(entry.path).catch(() => []) : null, // its .md paths, in join order
          planId: plan?.id || null,
        });
      }
      if (!cancelled) setFiles(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [repoRoot, importedKey]);

  const importFile = useCallback(async (file) => {
    const importedFrom = { path: file.path, hash: file.hash };
    const existing = file.planId && plans?.find((p) => p.id === file.planId);
    if (existing) {
      replaceSource(repoRoot, existing.id, { source: file.source, importedFrom });
    } else {
      await createPlan(repoRoot, { source: file.source, importedFrom });
    }
    setFiles((list) => list.filter((f) => f.path !== file.path));
  }, [repoRoot, plans, createPlan, replaceSource]);

  // Offered after an import, so the choice comes once the plan is safe.
  const deleteFile = useCallback(
    (file) => invoke('delete_plan_file', { path: file.path }),
    [],
  );

  return { files, importFile, deleteFile };
}
