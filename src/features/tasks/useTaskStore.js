import { useCallback, useRef, useState } from 'react';
import { load, save } from '../../lib/fileStore';
import { GLOBAL, normalizeTask } from './taskModel';

// The task lists and their files (under ~/.lirah), loaded on first use and
// written back debounced through fileStore:
//   global:     tasks/global.json (first saved as tasks/inbox.json)
//   workspace:  workspaces/<id>/tasks.json

const PERSIST_DEBOUNCE = 400;

export const taskFile = (scope) => (scope === GLOBAL ? 'tasks/global.json' : `workspaces/${scope}/tasks.json`);

async function readTasks(scope) {
  let doc = await load(taskFile(scope));
  if (!doc && scope === GLOBAL) doc = await load('tasks/inbox.json');
  return Array.isArray(doc?.tasks) ? doc.tasks : [];
}

const persist = (scope, tasks) => {
  save(taskFile(scope), { scope, tasks }, { debounce: PERSIST_DEBOUNCE })
    .catch((e) => console.error('Failed to save tasks:', e));
};

export function useTaskStore() {
  const [tasksByScope, setTasksByScope] = useState({}); // scope -> task[]
  const stateRef = useRef(tasksByScope);
  stateRef.current = tasksByScope;
  const loadingRef = useRef(new Map()); // scope -> Promise
  const loadedRef = useRef(new Set());

  const loadScope = useCallback((scope) => {
    if (!scope) return Promise.resolve();
    if (loadedRef.current.has(scope)) return Promise.resolve();
    const pending = loadingRef.current.get(scope);
    if (pending) return pending;
    const promise = (async () => {
      let tasks = [];
      try {
        tasks = await readTasks(scope);
      } catch (e) {
        console.warn('Failed to read tasks:', e);
      }
      tasks = tasks.map(normalizeTask);
      loadedRef.current.add(scope);
      // A write made while loading (quick add before the file was read) keeps
      // its tasks, ahead of the ones on disk.
      const early = stateRef.current[scope];
      const merged = early ? [...early, ...tasks.filter((t) => !early.some((e) => e.id === t.id))] : tasks;
      if (early) persist(scope, merged);
      stateRef.current = { ...stateRef.current, [scope]: merged };
      setTasksByScope(stateRef.current);
    })().finally(() => loadingRef.current.delete(scope));
    loadingRef.current.set(scope, promise);
    return promise;
  }, []);

  // The ref is updated at once, so a chain of calls reads its own writes.
  const mutate = useCallback((scope, fn) => {
    const tasks = fn(stateRef.current[scope] || []);
    stateRef.current = { ...stateRef.current, [scope]: tasks };
    setTasksByScope(stateRef.current);
    // Not read yet: loadScope merges and saves, so the file isn't overwritten.
    if (loadedRef.current.has(scope)) persist(scope, tasks);
  }, []);

  return { tasksByScope, stateRef, loadScope, mutate };
}
