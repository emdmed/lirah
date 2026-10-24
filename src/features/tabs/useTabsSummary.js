import { useState, useEffect, useRef, useCallback } from 'react';
import { TAB_CLI_PROCESSES } from '../../lib/agentClis';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { usePageVisible } from '../../hooks/usePageVisible';
import { createStore, useStore } from '../../lib/createStore';
import { getTabSession } from './terminalActivity';

// get_git_stats is served from the backend cache, so the repo poll is cheap;
// it only backs up the git-stats-changed / branch-changed events.
const REPO_POLL_MS = 15000;
const CLI_POLL_MS = 3000;
const TICK_MS = 1000;

/** Path with trailing slashes removed (but "/" kept), for comparing repo paths. */
function normPath(p) {
  if (typeof p !== 'string') return p;
  const trimmed = p.replace(/[\\/]+$/, '');
  return trimmed || p;
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- Which sessions have a CLI agent running under their shell ---
//
// One poll for the whole app, a setTimeout chain that runs while anyone
// watches. Watchers only watch while their window is visible, so the poll
// stops with them. Each watcher is a function returning the session ids it
// wants, read on every poll, since a tab's session changes when its terminal
// restarts.

const cliStore = createStore({}); // sessionId -> CLI process name, or null
const cliWatchers = new Set();
let cliTimer = null;
let cliInFlight = false;

async function pollCli() {
  cliTimer = null;
  cliInFlight = true;
  const ids = new Set();
  for (const watch of cliWatchers) for (const id of watch()) if (id) ids.add(id);
  let next = {};
  if (ids.size) {
    try {
      // One call for every session: the backend walks each process tree once.
      next = await invoke('detect_pty_clis', { sessionIds: [...ids], names: TAB_CLI_PROCESSES });
    } catch { /* keep {}: treat all as not running */ }
  }
  cliInFlight = false;
  cliStore.set((prev) => (sameJson(prev, next) ? prev : next));
  if (cliWatchers.size) cliTimer = setTimeout(pollCli, CLI_POLL_MS);
}

// Start watching: polls now (unless a poll is already under way) and every
// CLI_POLL_MS after. Returns the function that stops watching.
function watchCli(getSessionIds) {
  cliWatchers.add(getSessionIds);
  if (!cliInFlight) {
    clearTimeout(cliTimer);
    pollCli();
  }
  return () => {
    cliWatchers.delete(getSessionIds);
    if (cliWatchers.size === 0) {
      clearTimeout(cliTimer);
      cliTimer = null;
    }
  };
}

/** The CLI process running in `sessionId` ('claude', 'opencode'), or null. Polls only while `enabled`. */
export function useCliRunning(sessionId, enabled = true) {
  useEffect(() => {
    if (!enabled || !sessionId) return undefined;
    return watchCli(() => [sessionId]);
  }, [enabled, sessionId]);
  return useStore(cliStore)[sessionId] ?? null;
}

/**
 * Branch, diff totals and CLI state for every open tab, for the tabs summary
 * pane. Only works while `enabled` and the window is visible.
 * @returns {{ repo: Object, cli: Object, now: number }} repo/cli keyed by tab id
 */
export function useTabsSummary(tabs, enabled = true) {
  const pageVisible = usePageVisible();
  const live = enabled && pageVisible;
  const [repo, setRepo] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const pathsKey = tabs.map((t) => `${t.id}:${t.projectPath}`).join('|');

  // Refetch every tab, or only those whose project is `repoPath`.
  const fetchRepos = useCallback(async (repoPath) => {
    const target = repoPath == null ? null : normPath(repoPath);
    const tabs = target == null
      ? tabsRef.current
      : tabsRef.current.filter((t) => normPath(t.projectPath) === target);
    if (!tabs.length) return;
    const entries = await Promise.all(tabs.map(async (t) => {
      try {
        const [branch, stats] = await Promise.all([
          invoke('get_current_branch', { repoPath: t.projectPath }),
          invoke('get_git_stats', { path: t.projectPath }).catch(() => null),
        ]);
        let added = 0;
        let deleted = 0;
        let files = 0;
        for (const s of Object.values(stats || {})) {
          added += s.added || 0;
          deleted += s.deleted || 0;
          files += 1;
        }
        return [t.id, { branch, added, deleted, files }];
      } catch {
        return [t.id, null];
      }
    }));
    const fetched = Object.fromEntries(entries);
    const current = new Set(tabsRef.current.map((t) => t.id));
    setRepo((prev) => {
      // A full refetch replaces the map; a partial one merges into it. Either
      // way, drop tabs that have closed.
      const merged = target == null ? fetched : { ...prev, ...fetched };
      const next = Object.fromEntries(Object.entries(merged).filter(([id]) => current.has(id)));
      return sameJson(prev, next) ? prev : next;
    });
  }, []);

  // Repo state: on backend events (debounced, only the changed repo's tabs)
  // plus a slow fallback poll.
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    let pollTimer = null;
    let eventTimer = null;
    const unlisteners = [];

    const poll = async () => {
      await fetchRepos();
      if (!cancelled) pollTimer = setTimeout(poll, REPO_POLL_MS);
    };
    poll();

    // Debounced, then only the tabs of the repos that changed. Payloads:
    // git-stats-changed is the watched path, branch-changed is { path, branch }.
    // An event without a path refetches every tab.
    let pendingPaths = new Set();
    let pendingAll = false;
    const onEvent = ({ payload }) => {
      const repoPath = typeof payload === 'string' ? payload : payload?.path;
      if (repoPath) pendingPaths.add(repoPath);
      else pendingAll = true;
      clearTimeout(eventTimer);
      eventTimer = setTimeout(() => {
        if (cancelled) return;
        const paths = [...pendingPaths];
        const all = pendingAll;
        pendingPaths = new Set();
        pendingAll = false;
        if (all) fetchRepos();
        else paths.forEach((p) => fetchRepos(p));
      }, 300);
    };
    for (const name of ['git-stats-changed', 'branch-changed']) {
      listen(name, onEvent).then((fn) => {
        if (cancelled) fn();
        else unlisteners.push(fn);
      });
    }

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      clearTimeout(eventTimer);
      unlisteners.forEach((fn) => fn());
    };
  }, [live, pathsKey, fetchRepos]);

  // Which tabs have a CLI agent running in their terminal, by tab id. Kept the
  // same object while nothing changed.
  useEffect(() => {
    if (!live) return undefined;
    return watchCli(() => tabsRef.current.map((t) => getTabSession(t.id)));
  }, [live, pathsKey]);
  const running = useStore(cliStore);
  const next = Object.fromEntries(tabs.map((t) => [t.id, running[getTabSession(t.id)] ?? null]));
  const cliRef = useRef(next);
  if (!sameJson(cliRef.current, next)) cliRef.current = next;
  const cli = cliRef.current;

  // Clock for activity state and durations, read from terminalActivity.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, [live]);

  return { repo, cli, now };
}
