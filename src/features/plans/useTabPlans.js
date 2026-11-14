import { useEffect, useMemo } from 'react';
import { usePlansActions, usePlansByRepo } from './PlansContext';
import { useRepoRoots } from './planRepoRoot';
import { planProgress, planTabId, runRank, SPLIT_STATUS } from './planModel';

/**
 * Plans for the tabs pane: the ones working in each open tab (tab id ->
 * plans), how many of each tab's repo's plans have work left and no tab
 * (tab id -> count), and each plan's repo root (plan id -> root). Shelved
 * plans count in neither.
 */
export function useTabPlans(tabs) {
  const roots = useRepoRoots(tabs.map((t) => t.projectPath));
  const plansByRepo = usePlansByRepo();
  const { loadRepo } = usePlansActions();

  useEffect(() => {
    for (const root of new Set(Object.values(roots))) loadRepo(root);
  }, [roots, loadRepo]);

  return useMemo(() => {
    // A plan's terminal counts as its project tab.
    const hostOf = new Map(tabs.map((t) => [t.id, t.planHost || t.id]));
    const byTab = {};
    const rootOf = new Map();
    for (const [root, plans] of Object.entries(plansByRepo || {})) {
      for (const plan of plans) {
        rootOf.set(plan.id, root);
        const tabId = hostOf.get(planTabId(plan));
        if (!plan.shelved && tabId) (byTab[tabId] ||= []).push(plan);
      }
    }
    for (const list of Object.values(byTab)) list.sort((a, b) => runRank(a) - runRank(b));

    const isPending = (plan) => {
      if (plan.shelved || hostOf.has(planTabId(plan))) return false;
      if (plan.split !== SPLIT_STATUS.DONE) return true;
      const { done, total } = planProgress(plan);
      return done < total;
    };
    const pending = {};
    for (const t of tabs) {
      const n = (plansByRepo?.[roots[t.projectPath]] || []).filter(isPending).length;
      if (n) pending[t.id] = n;
    }

    return { byTab, pending, rootOf };
  }, [tabs, plansByRepo, roots]);
}
