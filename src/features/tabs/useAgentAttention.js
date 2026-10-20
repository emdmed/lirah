import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { notify } from '../../lib/notify';
import { focusPane } from '../../hooks/usePaneShortcuts';
import { useBookmarks } from '../bookmarks';
import { getTabSession } from './terminalActivity';
import {
  acknowledgeAgent,
  getAgentHookState,
  getAgentHookVersion,
  needsAttention,
  setAgentFocusResolver,
  subscribeAgentHooks,
} from './agentHookState';

// A finished turn shorter than this isn't worth a desktop notification: you
// were most likely still watching it.
const NOTIFY_MIN_TURN_MS = 30 * 1000;
// Alerts this close together go out as one notification.
const NOTIFY_BATCH_MS = 1500;

// Lets the status bar and the workspace pane jump to the next waiting tab
// without sharing App's state.
export const ATTENTION_JUMP_EVENT = 'lirah:attention-jump';

export function requestAttentionJump() {
  window.dispatchEvent(new CustomEvent(ATTENTION_JUMP_EVENT));
}

function formatDuration(ms) {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return secs % 60 ? `${mins}m ${secs % 60}s` : `${mins}m`;
}

function cliLabel(source) {
  return source === 'opencode' ? 'opencode' : 'Claude';
}

/**
 * Tabs whose agent is waiting on you and that you haven't looked at since:
 * blocked on permission first, then oldest first.
 * @returns {Array<{ tabId: string, sessionId: string, state: string, at: number }>}
 */
export function useAttentionQueue(tabs) {
  // Changes on every hook event; the queue is rebuilt from module state.
  const version = useSyncExternalStore(subscribeAgentHooks, getAgentHookVersion);
  return useMemo(() => {
    const queue = [];
    for (const tab of tabs) {
      const sessionId = getTabSession(tab.id);
      if (!needsAttention(sessionId)) continue;
      const { state, at } = getAgentHookState(sessionId);
      queue.push({ tabId: tab.id, sessionId, state, at });
    }
    return queue.sort((a, b) => (a.state === 'permission') !== (b.state === 'permission')
      ? (a.state === 'permission' ? -1 : 1)
      : a.at - b.at);
  }, [tabs, version]);
}

/**
 * Keeps the attention queue honest (what you are looking at is acknowledged),
 * sends desktop notifications for agents that need you while you are looking
 * elsewhere, and jumps to the next tab in the queue.
 * @returns {{ queue: Array, jumpToNext: () => boolean }}
 */
export function useAgentAttention({ tabs, activeTabId, switchTab }) {
  const { bookmarks } = useBookmarks();
  const queue = useAttentionQueue(tabs);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const bookmarksRef = useRef(bookmarks);
  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
    bookmarksRef.current = bookmarks;
  }, [tabs, activeTabId, bookmarks]);

  const isFocused = useCallback(
    (sessionId) => document.hasFocus() && !!sessionId && getTabSession(activeTabIdRef.current) === sessionId,
    [],
  );

  useEffect(() => {
    setAgentFocusResolver(isFocused);
    return () => setAgentFocusResolver(null);
  }, [isFocused]);

  // Looking at a tab acknowledges it: on switching to it and on coming back to
  // the window.
  useEffect(() => {
    acknowledgeAgent(getTabSession(activeTabId));
    const onFocus = () => acknowledgeAgent(getTabSession(activeTabIdRef.current));
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [activeTabId]);

  // Desktop notifications, batched.
  useEffect(() => {
    let pending = [];
    let timer = null;
    const tabName = (sessionId) => {
      const tab = tabsRef.current.find((t) => getTabSession(t.id) === sessionId);
      if (!tab) return null;
      return bookmarksRef.current.find((b) => b.path === tab.projectPath)?.name ?? tab.label;
    };
    const flush = () => {
      timer = null;
      const alerts = pending;
      pending = [];
      if (alerts.length === 1) {
        notify(alerts[0].title, alerts[0].body);
      } else if (alerts.length > 1) {
        notify(`${alerts.length} agents need you`, alerts.map((a) => a.title).join('\n'));
      }
    };
    const onChange = ({ sessionId, prev, next, turnMs }) => {
      if (!next || isFocused(sessionId)) return;
      const name = tabName(sessionId);
      if (!name) return;
      const cli = cliLabel(next.source);
      let alert = null;
      if (next.state === 'permission' && prev?.state !== 'permission') {
        alert = {
          title: `${name} · ${cli} needs permission`,
          body: next.message || 'Approve or deny to let it continue.',
        };
      } else if (next.state === 'done' && turnMs >= NOTIFY_MIN_TURN_MS) {
        alert = { title: `${name} · ${cli} done`, body: `Finished after ${formatDuration(turnMs)}.` };
      }
      if (!alert) return;
      pending = pending.filter((a) => a.sessionId !== sessionId);
      pending.push({ ...alert, sessionId });
      if (!timer) timer = setTimeout(flush, NOTIFY_BATCH_MS);
    };
    const unsubscribe = subscribeAgentHooks(onChange);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [isFocused]);

  // Switches to the first tab in the queue and puts focus in its terminal.
  // Switching acknowledges it, so the next call moves on to the next one.
  const jumpToNext = useCallback(() => {
    const target = queue.find((q) => q.tabId !== activeTabIdRef.current) || queue[0];
    if (!target) return false;
    if (target.tabId === activeTabIdRef.current) acknowledgeAgent(target.sessionId);
    else switchTab(target.tabId);
    requestAnimationFrame(() => requestAnimationFrame(() => focusPane(2)));
    return true;
  }, [queue, switchTab]);

  useEffect(() => {
    const onRequest = () => jumpToNext();
    window.addEventListener(ATTENTION_JUMP_EVENT, onRequest);
    return () => window.removeEventListener(ATTENTION_JUMP_EVENT, onRequest);
  }, [jumpToNext]);

  return { queue, jumpToNext };
}
