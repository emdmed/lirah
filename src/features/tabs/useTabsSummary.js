import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { usePageVisible } from '../../hooks/usePageVisible';
import { getTabSession } from './terminalActivity';

// get_git_stats is served from the backend cache, so the repo poll is cheap;
// it only backs up the git-stats-changed / branch-changed events.
const REPO_POLL_MS = 15000;
const CLI_POLL_MS = 3000;
const TICK_MS = 1000;
const CLI_NAMES = ['claude', 'opencode'];

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
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
  const [cli, setCli] = useState({});
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

  const fetchCli = useCallback(async () => {
    const entries = await Promise.all(tabsRef.current.map(async (t) => {
      const sessionId = getTabSession(t.id);
      if (!sessionId) return [t.id, null];
      for (const processName of CLI_NAMES) {
        try {
          if (await invoke('check_pty_child_process', { sessionId, processName })) return [t.id, processName];
        } catch { /* session gone */ }
      }
      return [t.id, null];
    }));
    const next = Object.fromEntries(entries);
    setCli((prev) => (sameJson(prev, next) ? prev : next));
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

  // Which tabs have a CLI agent running in their terminal.
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    let timer = null;
    const poll = async () => {
      await fetchCli();
      if (!cancelled) timer = setTimeout(poll, CLI_POLL_MS);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [live, pathsKey, fetchCli]);

  // Clock for activity state and durations, read from terminalActivity.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, [live]);

  return { repo, cli, now };
}
