import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { hash8 } from '../../lib/ids';
import { lastSepIndex } from '../../utils/pathUtils';
import { usePlansActions } from '../plans/PlansContext';
import { buildTaskPlanPrompt } from '../plans/planPrompts';
import { getTabPrompt } from '../tabs/tabPrompts';
import { planContext } from './planContexts';
import { isOpen, newTask, planFileName, reorderSubset, TASK_STATUS } from './taskModel';
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
   * Send the task to the agent in `tabId` to plan, with a plan context in
   * front. The plan is to be saved in `root` as `<title>_plan.md`; with
   * `autoChunk` it is imported and split into chunks once written.
   */
  const planTask = useCallback(async (scope, id, { tabId, root, contextId, autoChunk = false }) => {
    const task = find(scope, id);
    if (!task) throw new Error('Task not found');
    const planPath = `${root}/${planFileName(task)}`;
    const text = buildTaskPlanPrompt({ task, context: planContext(contextId)?.text, planPath, autoChunk });
    const send = getTabPrompt(tabId)?.send;
    if (!send) throw new Error('that tab has no prompt to send to');
    await send(text);
    updateTask(scope, id, { status: TASK_STATUS.PLANNING, planPath, planId: null, planTabId: tabId, autoChunk });
    return planPath;
  }, [find, updateTask]);

  /**
   * The task's plan file → a plan in the plans pane, which splits it into
   * chunks. `source` is passed when the caller already read the file.
   */
  const importTaskPlan = useCallback(async (scope, id, source) => {
    const task = find(scope, id);
    if (!task?.planPath) throw new Error('This task has no plan file');
    const text = source ?? await invoke('read_file_content', { path: task.planPath });
    if (!text.trim()) throw new Error('The plan file is empty');
    const root = task.planPath.slice(0, lastSepIndex(task.planPath));
    const planId = await createPlan(root, { source: text, importedFrom: { path: task.planPath, hash: hash8(text) } });
    updateTask(scope, id, { status: TASK_STATUS.PLANNED, planId });
    return planId;
  }, [find, createPlan, updateTask]);

  // Sent tasks are followed to their plans wherever the tasks pane is.
  useTaskPlanLinks(tasksByScope, updateTask, importTaskPlan);

  const actions = useMemo(() => ({
    loadScope, addTask, updateTask, removeTask, restoreTask, reorderTasks, moveToScope, planTask, importTaskPlan,
  }), [loadScope, addTask, updateTask, removeTask, restoreTask, reorderTasks, moveToScope, planTask, importTaskPlan]);

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
