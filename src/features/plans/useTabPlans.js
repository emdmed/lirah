import { useEffect, useMemo } from 'react';
import { usePlansActions, usePlansByRepo } from './PlansContext';
import { useRepoRoots } from './planRepoRoot';
import { planProgress, planTabId, runRank, SPLIT_STATUS } from './planModel';

/**
 * Plans for the tabs pane: the ones working in each open tab (tab id ->
 * plans), the active tab's repo's plans with work left and no tab, and each
 * plan's repo root (plan id -> root). Shelved plans stay out of both lists.
 */
export function useTabPlans(tabs, activeTabId) {
  const roots = useRepoRoots(tabs.map((t) => t.projectPath));
  const plansByRepo = usePlansByRepo();
  const { loadRepo } = usePlansActions();

  useEffect(() => {
    for (const root of new Set(Object.values(roots))) loadRepo(root);
  }, [roots, loadRepo]);

  const activeRoot = roots[tabs.find((t) => t.id === activeTabId)?.projectPath] ?? null;

  return useMemo(() => {
    const open = new Set(tabs.map((t) => t.id));
    const byTab = {};
    const rootOf = new Map();
    for (const [root, plans] of Object.entries(plansByRepo || {})) {
      for (const plan of plans) {
        rootOf.set(plan.id, root);
        const tabId = planTabId(plan);
        if (!plan.shelved && open.has(tabId)) (byTab[tabId] ||= []).push(plan);
      }
    }
    for (const list of Object.values(byTab)) list.sort((a, b) => runRank(a) - runRank(b));

    const loose = (plansByRepo?.[activeRoot] || [])
      .filter((plan) => {
        if (plan.shelved || open.has(planTabId(plan))) return false;
        if (plan.split !== SPLIT_STATUS.DONE) return true;
        const { done, total } = planProgress(plan);
        return done < total;
      })
      .sort((a, b) => runRank(a) - runRank(b));

    return { byTab, loose, rootOf };
  }, [tabs, plansByRepo, activeRoot]);
}
