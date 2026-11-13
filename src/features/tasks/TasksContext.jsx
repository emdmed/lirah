import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { hash8 } from '../../lib/ids';
import { usePlansActions } from '../plans/PlansContext';
import { buildTaskPlanPrompt } from '../plans/planPrompts';
import { draftFiles, readPlanSource } from '../plans/usePlanFiles';
import { startDraft } from '../planning/planningModeStore';
import { basename } from '../../utils/pathUtils';
import { getSettings } from '../settings/settingsStore';
import { getTabPrompt } from '../tabs/tabPrompts';
import { planContext } from './planContexts';
import {
  buildFormatPrompt, GLOBAL, isOpen, newTask, parseFormatted, planRootOf, reorderSubset, TASK_STATUS, taskText,
} from './taskModel';
import { useTaskStore } from './useTaskStore';
import { useTaskPlanLinks } from './useTaskPlanLinks';

// Task lists, one per scope: the global list and one per project folder.

const TasksStateContext = createContext(null);
const TasksActionsContext = createContext(null);

export function TasksProvider({ children }) {
  const { tasksByScope, stateRef, loadScope, mutate } = useTaskStore();

  const { createPlan } = usePlansActions();
  const find = useCallback((scope, id) => stateRef.current[scope]?.find((t) => t.id === id), [stateRef]);

  // New tasks go on top, where the quick-add field is.
  const addTask = useCallback(async (scope, fields) => {
    await loadScope(scope);
    const task = newTask(fields);
    if (!task.title) return null;
    mutate(scope, (list) => [task, ...list]);
    return task.id;
  }, [loadScope, mutate]);

  /** A scope's tasks, loaded first if needed. */
  const getTasks = useCallback(async (scope) => {
    await loadScope(scope);
    return stateRef.current[scope] || [];
  }, [loadScope, stateRef]);

  const updateTask = useCallback((scope, id, patch) => {
    mutate(scope, (list) => list.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)));
  }, [mutate]);

  /** Removes the task; returns what restoreTask needs to undo it. */
  const removeTask = useCallback((scope, id) => {
    const list = stateRef.current[scope] || [];
    const index = list.findIndex((t) => t.id === id);
    if (index < 0) return null;
    const task = list[index];
    mutate(scope, (l) => l.filter((t) => t.id !== id));
    return { task, index };
  }, [stateRef, mutate]);

  const restoreTask = useCallback((scope, task, index) => {
    mutate(scope, (list) => {
      if (list.some((t) => t.id === task.id)) return list;
      const next = [...list];
      next.splice(Math.min(index, next.length), 0, task);
      return next;
    });
  }, [mutate]);

  const reorderTasks = useCallback((scope, ids, from, to) => {
    mutate(scope, (list) => reorderSubset(list, ids, from, to));
  }, [mutate]);

  const moveToScope = useCallback(async (from, to, id) => {
    const task = find(from, id);
    if (!task || from === to) return;
    await loadScope(to);
    mutate(from, (list) => list.filter((t) => t.id !== id));
    mutate(to, (list) => [{ ...task, updatedAt: Date.now() }, ...list.filter((t) => t.id !== id)]);
  }, [find, loadScope, mutate]);

  /**
   * Have a model rewrite the task as a user story. Edits made while it runs
   * win: the result only lands if the task's text is still what was sent.
   */
  const formatTask = useCallback(async (scope, id, cwd) => {
    const task = find(scope, id);
    if (!task) return;
    const sent = taskText(task);
    const out = await invoke('format_task', { projectDir: cwd, prompt: buildFormatPrompt(sent, getSettings().taskFormatPrompt) });
    const formatted = parseFormatted(out);
    if (!formatted) throw new Error('the model returned no story');
    const now = find(scope, id);
    if (now && taskText(now) === sent) updateTask(scope, id, formatted);
  }, [find, updateTask]);

  /**
   * Plan the task as `lirah plans draft` does: planning mode opens in `tabId`
   * on a ~/.lirah/plans/<YYYY-MM>/<title>_plan draft folder for `root`, and the
   * task goes to that tab's agent with a plan context in front. The draft is
   * approved and split from the planning panel.
   */
  const planTask = useCallback(async (scope, id, { tabId, root, contextId }) => {
    const task = find(scope, id);
    if (!task) throw new Error('Task not found');
    const send = getTabPrompt(tabId)?.send;
    if (!send) throw new Error('that tab has no prompt to send to');
    const folder = await startDraft(tabId, task.title, root);
    const files = (await draftFiles(folder)).map((p) => basename(p));
    await send(buildTaskPlanPrompt({ task, context: planContext(contextId)?.text, folder, files }));
    updateTask(scope, id, { status: TASK_STATUS.PLANNING, planPath: folder, planRoot: root, planId: null, planTabId: tabId, autoChunk: false });
    return folder;
  }, [find, updateTask]);

  /**
   * The task's plan file → a plan in the plans pane, which splits it into
   * chunks. `source` is passed when the caller already read the file.
   */
  const importTaskPlan = useCallback(async (scope, id, source) => {
    const task = find(scope, id);
    if (!task?.planPath) throw new Error('This task has no plan file');
    const text = source ?? await readPlanSource(task.planPath);
    if (!text.trim()) throw new Error('The plan file is empty');
    const root = planRootOf(task);
    const planId = await createPlan(root, {
      source: text,
      importedFrom: { path: task.planPath, hash: hash8(text) },
      ...(scope !== GLOBAL && { workspaceId: scope }), // a global task's plan goes to the active workspace
    });
    updateTask(scope, id, { status: TASK_STATUS.PLANNED, planId });
    return planId;
  }, [find, createPlan, updateTask]);

  // Sent tasks are followed to their plans wherever the tasks pane is.
  useTaskPlanLinks(tasksByScope, updateTask, importTaskPlan);

  const actions = useMemo(() => ({
    loadScope, getTasks, addTask, updateTask, removeTask, restoreTask, reorderTasks, moveToScope, planTask, importTaskPlan, formatTask,
  }), [loadScope, getTasks, addTask, updateTask, removeTask, restoreTask, reorderTasks, moveToScope, planTask, importTaskPlan, formatTask]);

  return (
    <TasksActionsContext.Provider value={actions}>
      <TasksStateContext.Provider value={tasksByScope}>{children}</TasksStateContext.Provider>
    </TasksActionsContext.Provider>
  );
}

export function useTasksActions() {
  const ctx = useContext(TasksActionsContext);
  if (!ctx) throw new Error('useTasksActions must be used within a TasksProvider');
  return ctx;
}

/** One scope's tasks (loaded on first use; null until then) plus the actions. */
export function useTasks(scope) {
  const tasksByScope = useContext(TasksStateContext);
  const actions = useTasksActions();
  const { loadScope } = actions;
  useEffect(() => {
    loadScope(scope);
  }, [scope, loadScope]);
  const tasks = (scope && tasksByScope?.[scope]) || null;
  return { tasks, ...actions };
}

/** Tasks not done yet in `scope`. */
export function useOpenTaskCount(scope) {
  const { tasks } = useTasks(scope);
  return useMemo(() => (tasks || []).filter(isOpen).length, [tasks]);
}

/** The loaded task that `planId` was planned for, or null. */
export function useTaskForPlan(planId) {
  const tasksByScope = useContext(TasksStateContext);
  return useMemo(
    () => Object.values(tasksByScope || {}).flat().find((t) => t.planId === planId) ?? null,
    [tasksByScope, planId]
  );
}
