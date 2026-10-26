import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { errorMessage } from '../../lib/errorMessage';
import { formatDuration } from '../../lib/formatDuration';
import { notify } from '../../lib/notify';
import { getAgentHookState, getAgentTranscript, subscribeAgentHooks } from '../tabs/agentHookState';
import { getTabSession } from '../tabs/terminalActivity';
import {
  AUTO_RESUME_REASONS, AUTOPILOT_STATUS, CHUNK_STATUS, EXCERPT_MAX, HALT_REASON, isAutopilotLive, nextChunkId,
  planProgress, UNTITLED_PLAN,
} from './planModel';
import { buildNudgePrompt, parseStatusMarker, STATUS_DONE } from './planPrompts';
import { requestPlanFocus } from './plansPaneEvents';
import { useHookWatchdog } from './useHookWatchdog';

// Auto-pilot (plan.autopilot) chains the chunks in one tab: each Stop with the
// chunk's commit sends the next one. It stops to notify you when the plan is
// done (status 'done'), when it needs you (status 'paused': a question, a
// permission prompt, no commit after one nudge) and when something broke
// (status 'failed').

// A PermissionRequest carries the tool name; a Notification, a sentence.
function permissionMessage(message) {
  if (!message) return 'Waiting on a permission prompt in the terminal.';
  return /\s/.test(message.trim()) ? message : `Waiting on permission to use ${message}.`;
}

/** The last line or so of an agent's reply, for a notification. */
function excerpt(text, max = EXCERPT_MAX) {
  const line = String(text || '').trim().split('\n').filter((l) => l.trim()).pop() || '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** The text of the last reply of the agent in `sessionId`, or null. */
async function lastReply(sessionId) {
  const transcriptPath = getAgentTranscript(sessionId);
  return transcriptPath ? invoke('last_assistant_text', { transcriptPath }).catch(() => null) : null;
}

/** Is this plan's live run driven by the agent in `sessionId`? */
const pilotedBy = (plan, sessionId) => isAutopilotLive(plan.autopilot) && getTabSession(plan.autopilot.tabId) === sessionId;

const inFlight = (chunk) => chunk.status === CHUNK_STATUS.IN_PROGRESS || chunk.awaitingFix;

/**
 * The auto-pilot actions, plus the hook-event and closed-tab watchers that
 * drive the runs. Plan state comes from usePlanStore; chunk work from the
 * provider's checkChunk, implementChunk and sendToTab.
 */
export function useAutopilot({
  stateRef, findPlan, updatePlan, checkChunk, markChunkDone, implementChunk, sendToTab, tabs, switchTab, toast,
}) {
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const setAutopilot = useCallback((repoRoot, planId, patch) => {
    updatePlan(repoRoot, planId, (p) => ({
      autopilot: patch === null ? null : { ...p.autopilot, ...patch, at: Date.now() },
    }));
  }, [updatePlan]);

  // Bring the run into view: its tab, and the plan open in the plans pane.
  const revealRun = useCallback((repoRoot, planId) => {
    const tabId = findPlan(repoRoot, planId)?.autopilot?.tabId;
    if (tabId && tabsRef.current.some((t) => t.id === tabId)) switchTab(tabId);
    requestPlanFocus(planId);
  }, [findPlan, switchTab]);

  // Desktop notification plus a toast, for the three outcomes you asked to
  // hear about. Both lead back to the run; the ones that need you stay up.
  const announce = useCallback((repoRoot, plan, kind, body) => {
    const name = plan.title || UNTITLED_PLAN;
    const title = {
      [AUTOPILOT_STATUS.DONE]: `✓ ${name} · plan complete`,
      [AUTOPILOT_STATUS.PAUSED]: `${name} · needs you`,
      [AUTOPILOT_STATUS.FAILED]: `${name} · auto-pilot error`,
    }[kind];
    const reveal = () => revealRun(repoRoot, plan.id);
    notify(title, body, { onClick: reveal });
    const t = toastRef.current;
    const show = kind === AUTOPILOT_STATUS.DONE ? t.success : kind === AUTOPILOT_STATUS.PAUSED ? t.warning : t.error;
    show(`${title}${body ? ` — ${body}` : ''}`, {
      action: { label: 'show', onClick: reveal },
      ...(kind === AUTOPILOT_STATUS.DONE ? {} : { duration: 0 }),
    });
  }, [revealRun]);

  // Stop the run, notifying when it was running (not again for every later event).
  const halt = useCallback((repoRoot, planId, status, reason, message) => {
    const plan = findPlan(repoRoot, planId);
    if (!plan?.autopilot) return;
    const wasRunning = plan.autopilot.status === AUTOPILOT_STATUS.RUNNING;
    setAutopilot(repoRoot, planId, { status, reason, message });
    // Permission prompts already get a desktop alert from useAgentAttention.
    if (wasRunning && reason !== HALT_REASON.PERMISSION) announce(repoRoot, plan, status, message);
  }, [findPlan, setAutopilot, announce]);

  // After a send, pause the run if the agent's hooks stay silent.
  const expectHooks = useHookWatchdog({ findPlan, halt });

  // Run `send`; if it throws, the run fails with send-failed, else it waits on the agent's hooks.
  const sendOrHalt = useCallback(async (repoRoot, planId, send) => {
    try {
      await send();
    } catch (e) {
      halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.SEND_FAILED, errorMessage(e));
      return;
    }
    expectHooks(repoRoot, planId);
  }, [halt, expectHooks]);

  // Remind the agent to commit `chunk`, once per chunk.
  const nudge = useCallback((repoRoot, plan, chunk) => sendOrHalt(repoRoot, plan.id, async () => {
    await sendToTab(plan.autopilot.tabId, buildNudgePrompt(plan, chunk));
    setAutopilot(repoRoot, plan.id, { nudged: true });
  }), [sendOrHalt, sendToTab, setAutopilot]);

  // Send the next chunk, or finish.
  const advance = useCallback(async (repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    const ap = plan?.autopilot;
    if (ap?.status !== AUTOPILOT_STATUS.RUNNING) return;
    const nextId = nextChunkId(plan);
    if (!nextId) {
      const { done } = planProgress(plan);
      const commits = plan.chunks.reduce((n, c) => n + (c.status === CHUNK_STATUS.IMPLEMENTED ? c.commits.length : 0), 0);
      setAutopilot(repoRoot, planId, { status: AUTOPILOT_STATUS.DONE, chunkId: null, reason: null, message: null, endedAt: Date.now() });
      const took = ap.startedAt ? ` in ${formatDuration(Date.now() - ap.startedAt)}` : '';
      announce(repoRoot, plan, AUTOPILOT_STATUS.DONE,
        `${done} chunk${done === 1 ? '' : 's'}, ${commits} commit${commits === 1 ? '' : 's'}${took}.`);
      return;
    }
    // Recorded first, so a failed send points at the chunk it was for.
    setAutopilot(repoRoot, planId, { chunkId: nextId, nudged: false });
    await sendOrHalt(repoRoot, planId, () => implementChunk(repoRoot, planId, nextId, ap.tabId, { autopilot: true }));
  }, [findPlan, setAutopilot, announce, implementChunk, sendOrHalt]);

  // Pick up where the run is: the current chunk if it is still in flight
  // (committed → move on; agent idle → nudge), else the next one.
  const kick = useCallback(async (repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    const ap = plan?.autopilot;
    if (ap?.status !== AUTOPILOT_STATUS.RUNNING) return;
    const current = plan.chunks.find((c) => c.id === ap.chunkId && c.status === CHUNK_STATUS.IN_PROGRESS);
    if (!current) return advance(repoRoot, planId);
    const res = await checkChunk(repoRoot, planId, current.id);
    if (res.error) return halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.GIT_ERROR, res.error);
    if (res.found) return advance(repoRoot, planId);
    if (getAgentHookState(getTabSession(ap.tabId))?.state === 'working') return; // Its Stop will come.
    await nudge(repoRoot, plan, current);
  }, [findPlan, advance, checkChunk, halt, nudge]);

  const startAutopilot = useCallback((repoRoot, planId, tabId) => {
    const plan = findPlan(repoRoot, planId);
    if (!plan) return;
    // A chunk already sent by hand is adopted rather than sent again.
    const sent = plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS);
    setAutopilot(repoRoot, planId, {
      status: AUTOPILOT_STATUS.RUNNING, tabId, chunkId: sent?.id ?? null, nudged: false, reason: null, message: null,
      startedAt: Date.now(), endedAt: null,
    });
    return kick(repoRoot, planId);
  }, [findPlan, setAutopilot, kick]);

  const resumeAutopilot = useCallback((repoRoot, planId, tabId) => {
    const ap = findPlan(repoRoot, planId)?.autopilot;
    setAutopilot(repoRoot, planId, {
      status: AUTOPILOT_STATUS.RUNNING, tabId: tabId || ap?.tabId, nudged: false, reason: null, message: null,
    });
    return kick(repoRoot, planId);
  }, [findPlan, setAutopilot, kick]);

  // Turned off by hand: keeps a note of where it stopped until dismissed.
  const stopAutopilot = useCallback((repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    const chunk = plan?.chunks.find((c) => c.id === plan.autopilot?.chunkId);
    setAutopilot(repoRoot, planId, {
      status: AUTOPILOT_STATUS.OFF,
      reason: HALT_REASON.STOPPED,
      message: chunk ? `Turned off during chunk ${chunk.n}. The agent wasn't interrupted.` : 'Turned off.',
    });
  }, [findPlan, setAutopilot]);

  const dismissAutopilot = useCallback((repoRoot, planId) => setAutopilot(repoRoot, planId, null), [setAutopilot]);

  // The agent's turn ended while auto-pilot was on its chunk.
  const onAutopilotStop = useCallback(async (repoRoot, planId, sessionId, error) => {
    const plan = findPlan(repoRoot, planId);
    const ap = plan?.autopilot;
    if (!ap) return;
    if (error) return halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.AGENT_ERROR, 'The agent stopped with an error.');
    const current = plan.chunks.find((c) => c.id === ap.chunkId);
    if (current?.status !== CHUNK_STATUS.IN_PROGRESS) return ap.status === AUTOPILOT_STATUS.RUNNING ? advance(repoRoot, planId) : undefined;
    const res = await checkChunk(repoRoot, planId, current.id);
    if (res.error) return halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.GIT_ERROR, res.error);
    if (res.found) {
      setAutopilot(repoRoot, planId, { status: AUTOPILOT_STATUS.RUNNING, nudged: false, reason: null, message: null });
      return advance(repoRoot, planId);
    }
    const text = await lastReply(sessionId);
    const marker = parseStatusMarker(text);
    if (marker?.kind === STATUS_DONE) {
      // Nothing to commit for this chunk (a check, a test run): on to the next.
      const done = await markChunkDone(repoRoot, planId, current.id, marker.message || null);
      if (done.error) return halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.GIT_ERROR, done.error);
      setAutopilot(repoRoot, planId, { status: AUTOPILOT_STATUS.RUNNING, nudged: false, reason: null, message: null });
      return advance(repoRoot, planId);
    }
    if (marker?.kind === HALT_REASON.BLOCKED) {
      return halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.BLOCKED, marker.message || `Chunk ${current.n}: the agent is blocked.`);
    }
    if (marker?.kind === HALT_REASON.NEEDS_INPUT) {
      return halt(repoRoot, planId, AUTOPILOT_STATUS.PAUSED, HALT_REASON.NEEDS_INPUT, marker.message || `Chunk ${current.n}: the agent has a question.`);
    }
    if (ap.status === AUTOPILOT_STATUS.RUNNING && !ap.nudged) return nudge(repoRoot, plan, current);
    const said = excerpt(text);
    halt(repoRoot, planId, AUTOPILOT_STATUS.PAUSED, HALT_REASON.NO_COMMIT,
      `Chunk ${current.n} stopped without committing.${said ? ` Last said: "${said}"` : ''}`);
  }, [findPlan, halt, advance, checkChunk, markChunkDone, setAutopilot, nudge]);

  // Hook events: check chunks when a turn ends; drive auto-pilot runs.
  useEffect(() => {
    // A chunk sent by hand: its commit, else the agent saying there was nothing to commit.
    const settle = async (repoRoot, planId, chunk, sessionId) => {
      const res = await checkChunk(repoRoot, planId, chunk.id);
      if (res.found || res.error || chunk.status !== CHUNK_STATUS.IN_PROGRESS) return;
      const marker = parseStatusMarker(await lastReply(sessionId));
      if (marker?.kind === STATUS_DONE) markChunkDone(repoRoot, planId, chunk.id, marker.message || null);
    };

    // Check the plan's chunks this session was working on (`which` of them).
    const checkSessionChunks = (repoRoot, plan, sessionId, which, check = (chunk) => checkChunk(repoRoot, plan.id, chunk.id)) => {
      for (const chunk of plan.chunks) {
        if (which(chunk) && getTabSession(chunk.tabId) === sessionId) check(chunk);
      }
    };

    // What the piloting agent's new state means for the run.
    const steer = (repoRoot, plan, sessionId, next, turnEnded) => {
      const ap = plan.autopilot;
      if (next === null) {
        return halt(repoRoot, plan.id, AUTOPILOT_STATUS.PAUSED, HALT_REASON.SESSION_ENDED, 'The agent exited. Relaunch it in the tab and resume.');
      }
      if (next?.state === 'permission' && ap.status === AUTOPILOT_STATUS.RUNNING) {
        return halt(repoRoot, plan.id, AUTOPILOT_STATUS.PAUSED, HALT_REASON.PERMISSION, permissionMessage(next.message));
      }
      if (next?.state === 'working' && ap.status === AUTOPILOT_STATUS.PAUSED && AUTO_RESUME_REASONS.has(ap.reason)) {
        // You answered or approved in the terminal: the run carries on.
        return setAutopilot(repoRoot, plan.id, {
          status: AUTOPILOT_STATUS.RUNNING, reason: null, message: null, nudged: ap.reason === HALT_REASON.PERMISSION ? ap.nudged : false,
        });
      }
      if (turnEnded && (ap.status === AUTOPILOT_STATUS.RUNNING || AUTO_RESUME_REASONS.has(ap.reason))) {
        onAutopilotStop(repoRoot, plan.id, sessionId, next.error);
      }
    };

    return subscribeAgentHooks(({ sessionId, prev, next }) => {
      const turnEnded = next?.state === 'done' && prev?.state !== 'done';
      for (const [repoRoot, plans] of Object.entries(stateRef.current)) {
        for (const plan of plans) {
          if (!pilotedBy(plan, sessionId)) {
            if (turnEnded) checkSessionChunks(repoRoot, plan, sessionId, inFlight, (c) => settle(repoRoot, plan.id, c, sessionId));
            continue;
          }
          const pilotChunkId = plan.autopilot.chunkId;
          steer(repoRoot, plan, sessionId, next, turnEnded);
          // Auto-pilot checks its own chunk; checking it here too would race.
          if (turnEnded) checkSessionChunks(repoRoot, plan, sessionId, (c) => c.awaitingFix && c.id !== pilotChunkId);
        }
      }
    });
  }, [stateRef, checkChunk, markChunkDone, halt, setAutopilot, onAutopilotStop]);

  // A run whose tab was closed would wait forever for a Stop.
  useEffect(() => {
    const open = new Set(tabs.map((t) => t.id));
    for (const [repoRoot, plans] of Object.entries(stateRef.current)) {
      for (const plan of plans) {
        const ap = plan.autopilot;
        if (isAutopilotLive(ap) && ap.reason !== HALT_REASON.APP_RESTARTED && !open.has(ap.tabId)) {
          halt(repoRoot, plan.id, AUTOPILOT_STATUS.FAILED, HALT_REASON.TAB_CLOSED, 'The tab running the plan was closed.');
        }
      }
    }
  }, [stateRef, tabs, halt]);

  return { startAutopilot, resumeAutopilot, stopAutopilot, dismissAutopilot, revealRun };
}
