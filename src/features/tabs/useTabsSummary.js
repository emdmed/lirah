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

async function runningCli(sessionId) {
  for (const processName of TAB_CLI_PROCESSES) {
    try {
      if (await invoke('check_pty_child_process', { sessionId, processName })) return processName;
    } catch { /* session gone */ }
  }
  return null;
}

async function pollCli() {
  cliTimer = null;
  cliInFlight = true;
  const ids = new Set();
  for (const watch of cliWatchers) for (const id of watch()) if (id) ids.add(id);
  const next = Object.fromEntries(await Promise.all([...ids].map(async (id) => [id, await runningCli(id)])));
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

  const fetchRepos = useCallback(async () => {
    const entries = await Promise.all(tabsRef.current.map(async (t) => {
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
    const next = Object.fromEntries(entries);
    setRepo((prev) => (sameJson(prev, next) ? prev : next));
  }, []);

  // Repo state: on backend events (debounced, any repo — one cached call per
  // tab) plus a slow fallback poll.
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

    const onEvent = () => {
      clearTimeout(eventTimer);
      eventTimer = setTimeout(() => { if (!cancelled) fetchRepos(); }, 300);
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
