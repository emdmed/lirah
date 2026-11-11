import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { hash8 } from '../../lib/ids';
import { markdownTitle } from './planPrompts';
import { loadAllPlans, MONTH_DIR } from './usePlanStore';

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
      const entries = (await Promise.all(months.map((m) => list(m.path)))).flat().filter((e) => !e.is_dir && /\.md$/i.test(e.name));
      // Imports made by other repos' plans, read from disk (this repo's are in `plans`).
      const others = new Set([...(await loadAllPlans().catch(() => new Map())).entries()]
        .filter(([root]) => root !== repoRoot)
        .flatMap(([, ps]) => ps.map((p) => p.importedFrom?.path).filter(Boolean)));
      const found = [];
      for (const entry of entries) {
        if (others.has(entry.path)) continue;
        let source;
        try {
          source = await invoke('read_file_content', { path: entry.path });
        } catch {
          continue; // Gone since the listing was cached.
        }
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
