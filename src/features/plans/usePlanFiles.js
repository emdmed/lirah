import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { hash8 } from '../../lib/ids';
import { planStarted } from './PlansContext';
import { markdownTitle } from './planPrompts';

// `overhaul_plan.md`, `smooth-improvements-plan.md`, `plan.md`.
const PLAN_FILE = /(^|[_-])plan\.md$/i;

/**
 * Plan files sitting at the repo root (where they used to be saved), so they
 * can be imported instead of pasted. Root only: that's where they live, and it
 * keeps the scan to one directory read. Ignored files are included on purpose.
 * Each entry is `new` (never imported) or `changed` (edited since its import).
 */
export function usePlanFiles({ repoRoot, plans, createPlan, replaceSource }) {
  const [files, setFiles] = useState([]);
  const [scanTick, setScanTick] = useState(0);

  const rescan = useCallback(() => setScanTick((t) => t + 1), []);

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
      let entries = [];
      try {
        entries = await invoke('read_directory', { path: repoRoot });
      } catch {
        return;
      }
      const found = [];
      for (const entry of entries) {
        if (entry.is_dir || !PLAN_FILE.test(entry.name)) continue;
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
  }, [repoRoot, importedKey, scanTick]);

  const importFile = useCallback(async (file, { deleteOriginal = false } = {}) => {
    const importedFrom = { path: file.path, hash: file.hash };
    const existing = file.planId && plans?.find((p) => p.id === file.planId);
    if (existing && !planStarted(existing)) {
      replaceSource(repoRoot, existing.id, { source: file.source, importedFrom });
    } else {
      await createPlan(repoRoot, { source: file.source, importedFrom });
    }
    setFiles((list) => list.filter((f) => f.path !== file.path));
    if (deleteOriginal) await invoke('delete_plan_file', { path: file.path, repoRoot });
  }, [repoRoot, plans, createPlan, replaceSource]);

  return { files, importFile, rescan };
}
