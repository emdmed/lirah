import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { basename } from '../../utils/pathUtils';
import { hash8 } from '../../lib/ids';
import { lirahDir } from '../../lib/lirahPaths';
import { GLOBAL, normalizeTask } from './taskModel';

// The task lists and their files, loaded on first use and written back
// debounced, the same way the plans store works:
//   global:   ~/.lirah/tasks/global.json
//   project:  ~/.lirah/tasks/<folder>-<hash>/tasks.json

const PERSIST_DEBOUNCE = 400;

function storePath(home, scope) {
  const base = `${lirahDir(home)}/tasks`;
  if (scope === GLOBAL) return `${base}/global.json`;
  return `${base}/${basename(scope, 'project')}-${hash8(scope)}/tasks.json`;
}

export function useTaskStore() {
  const [tasksByScope, setTasksByScope] = useState({}); // scope -> task[]
  const stateRef = useRef(tasksByScope);
  stateRef.current = tasksByScope;
  const homeRef = useRef(null);
  const loadingRef = useRef(new Map()); // scope -> Promise
  const loadedRef = useRef(new Set());
  const dirtyRef = useRef(new Set());
  const saveTimer = useRef(null);

  const getHome = useCallback(async () => {
    if (!homeRef.current) homeRef.current = await invoke('get_home_dir');
    return homeRef.current;
  }, []);

  const flush = useCallback(async () => {
    saveTimer.current = null;
    const scopes = [...dirtyRef.current];
    dirtyRef.current.clear();
    const home = await getHome();
    for (const scope of scopes) {
      const tasks = stateRef.current[scope];
      if (!tasks) continue;
      try {
        await invoke('write_file_content', {
          path: storePath(home, scope),
          content: JSON.stringify({ version: 1, scope, tasks }, null, 2),
        });
      } catch (e) {
        console.error('Failed to save tasks:', e);
      }
    }
  }, [getHome]);

  useEffect(() => {
    if (dirtyRef.current.size === 0 || saveTimer.current) return;
    saveTimer.current = setTimeout(flush, PERSIST_DEBOUNCE);
  }, [tasksByScope, flush]);

  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      flush();
    }
  }, [flush]);

  const loadScope = useCallback((scope) => {
    if (!scope) return Promise.resolve();
    if (loadedRef.current.has(scope)) return Promise.resolve();
    const pending = loadingRef.current.get(scope);
    if (pending) return pending;
    const promise = (async () => {
      let tasks = [];
      try {
        const home = await getHome();
        const raw = await invoke('read_file_content', { path: storePath(home, scope) }).catch((e) => {
          // The global list was first saved as inbox.json.
          if (scope !== GLOBAL) throw e;
          return invoke('read_file_content', { path: `${lirahDir(home)}/tasks/inbox.json` });
        });
        const list = JSON.parse(raw)?.tasks;
        tasks = Array.isArray(list) ? list : [];
      } catch {
        // No tasks here yet.
      }
      tasks = tasks.map(normalizeTask);
      loadedRef.current.add(scope);
      // A write made while loading (quick add before the file was read) keeps
      // its tasks, ahead of the ones on disk.
      const early = stateRef.current[scope];
      const merged = early ? [...early, ...tasks.filter((t) => !early.some((e) => e.id === t.id))] : tasks;
      if (early) dirtyRef.current.add(scope);
      stateRef.current = { ...stateRef.current, [scope]: merged };
      setTasksByScope(stateRef.current);
    })().finally(() => loadingRef.current.delete(scope));
    loadingRef.current.set(scope, promise);
    return promise;
  }, [getHome]);

  // The ref is updated at once, so a chain of calls reads its own writes.
  const mutate = useCallback((scope, fn) => {
    dirtyRef.current.add(scope);
    const next = { ...stateRef.current, [scope]: fn(stateRef.current[scope] || []) };
    stateRef.current = next;
    setTasksByScope(next);
  }, []);

  return { tasksByScope, stateRef, loadScope, mutate };
}
