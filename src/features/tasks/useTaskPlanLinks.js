import { useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { hash8 } from '../../lib/ids';
import { lastSepIndex } from '../../utils/pathUtils';
import { usePlansActions, usePlansByRepo } from '../plans/PlansContext';
import { requestPlanFocus } from '../plans/plansPaneEvents';
import { getAgentHookState } from '../tabs/agentHookState';
import { getTabSession } from '../tabs/terminalActivity';
import { useToast } from '../toast';
import { TASK_STATUS } from './taskModel';

const POLL_MS = 4000;

const dirname = (path) => path.slice(0, lastSepIndex(path));

// The agent is still on its turn: the plan file may be rewritten yet.
const BUSY_STATES = new Set(['working', 'permission']);
function agentBusy(tabId) {
  const session = tabId && getTabSession(tabId);
  return !!session && BUSY_STATES.has(getAgentHookState(session)?.state);
}

/**
 * Follows each sent task to its plan, across every loaded task list:
 * `planning` until the agent writes the plan file, then `planned`, and linked
 * to the plan once it is imported. A task sent with auto-chunk is imported by
 * itself (which starts the chunk split) once its file is there, the agent's
 * turn is over and the file has stopped changing. Polls only while some task
 * is waiting on its file.
 */
export function useTaskPlanLinks(tasksByScope, updateTask, importTaskPlan) {
  const plansByRepo = usePlansByRepo();
  const { loadRepo } = usePlansActions();
  const toast = useToast();

  const linked = useMemo(() => {
    const out = [];
    for (const [scope, tasks] of Object.entries(tasksByScope || {})) {
      for (const task of tasks) {
        if (task.planPath && (task.status === TASK_STATUS.PLANNING || task.status === TASK_STATUS.PLANNED)) {
          out.push({ scope, task });
        }
      }
    }
    return out;
  }, [tasksByScope]);

  // The plans of each folder a plan was saved in, to spot the import.
  const roots = useMemo(() => [...new Set(linked.map(({ task }) => dirname(task.planPath)))].join('\n'), [linked]);
  useEffect(() => {
    for (const root of roots ? roots.split('\n') : []) loadRepo(root);
  }, [roots, loadRepo]);

  const findPlan = (task) => {
    const plans = plansByRepo?.[dirname(task.planPath)];
    if (!plans) return undefined; // not loaded yet
    return plans.find((p) => p.id === task.planId) || plans.find((p) => p.importedFrom?.path === task.planPath) || null;
  };

  useEffect(() => {
    for (const { scope, task } of linked) {
      const plan = findPlan(task);
      if (plan === undefined) continue;
      if (plan?.merged) {
        updateTask(scope, task.id, { status: TASK_STATUS.DONE, planId: plan.id }); // shipped
      } else if (plan && (task.planId !== plan.id || task.status !== TASK_STATUS.PLANNED)) {
        updateTask(scope, task.id, { status: TASK_STATUS.PLANNED, planId: plan.id });
      } else if (!plan && task.planId) {
        updateTask(scope, task.id, { planId: null }); // the plan was deleted
      }
    }
  }, [linked, plansByRepo, updateTask]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tasks whose file isn't there yet, or that wait to be imported.
  const waiting = useMemo(
    () => linked.filter(({ task }) => task.status === TASK_STATUS.PLANNING || (task.autoChunk && !task.planId)),
    [linked]
  );
  const findPlanRef = useRef(findPlan);
  findPlanRef.current = findPlan;
  const lastHash = useRef(new Map()); // task id -> hash seen on the last poll
  const importing = useRef(new Set());

  useEffect(() => {
    if (waiting.length === 0) return;
    let cancelled = false;

    const autoImport = async (scope, task) => {
      if (importing.current.has(task.id) || agentBusy(task.planTabId)) return;
      if (findPlanRef.current(task) !== null) return; // already imported, or plans not loaded
      const source = await invoke('read_file_content', { path: task.planPath }).catch(() => null);
      if (cancelled || !source?.trim()) return;
      // Same text on two polls in a row: the agent is done writing it.
      const hash = hash8(source);
      const prev = lastHash.current.get(task.id);
      lastHash.current.set(task.id, hash);
      if (prev !== hash) return;
      importing.current.add(task.id);
      try {
        const planId = await importTaskPlan(scope, task.id, source);
        lastHash.current.delete(task.id);
        toast.success(`Plan for "${task.title}" imported, splitting into chunks`, {
          action: { label: 'open', onClick: () => requestPlanFocus(planId) },
        });
      } catch (e) {
        // Off for this task, so a failing import isn't retried every poll.
        updateTask(scope, task.id, { autoChunk: false });
        toast.error(`Couldn't import the plan for "${task.title}": ${e?.message || e}. Import it from the plans pane.`);
      } finally {
        importing.current.delete(task.id);
      }
    };

    const check = async () => {
      for (const { scope, task } of waiting) {
        const exists = await invoke('path_exists', { path: task.planPath }).catch(() => false);
        if (cancelled) return;
        if (!exists) continue;
        if (task.status === TASK_STATUS.PLANNING && !task.autoChunk) {
          updateTask(scope, task.id, { status: TASK_STATUS.PLANNED });
        } else if (task.autoChunk) {
          await autoImport(scope, task);
        }
      }
    };
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [waiting, updateTask, importTaskPlan, toast]);
}
