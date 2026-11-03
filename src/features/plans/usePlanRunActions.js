import { useCallback, useEffect, useState } from 'react';
import { dirtyCount } from '../../lib/git';
import { getSettings, setSetting } from '../settings/settingsStore';
import { getTabSession } from '../tabs/terminalActivity';
import { getAgentHookState, subscribeAgentHooks } from '../tabs/agentHookState';
import {
  AUTOPILOT_STATUS, CHUNK_STATUS, isAutopilotLive, nextChunkId, SPLIT_STATUS, UNTITLED_PLAN,
} from './planModel';
import { inWorkDir, planGit, workPath } from './planGit';
import { subscribeAutopilotToggle, takeAutopilotToggle } from './plansPaneEvents';
import { BUSY } from './PlanPaneContext';

// How long a new tab's Claude has to report in. Long enough for a first-run
// "trust this folder?" prompt in a fresh worktree.
const AGENT_START_TIMEOUT_MS = 120_000;
// After it reports in, before typing into it.
const AGENT_SETTLE_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves true once the agent in `tabId` is up and idle, or false after `ms`. */
function agentStarted(tabId, ms) {
  const ready = () => getAgentHookState(getTabSession(tabId))?.state === 'waiting';
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    const finish = (ok) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), ms);
    unsubscribe = subscribeAgentHooks(() => ready() && finish(true));
  });
}

/**
 * Sending chunks to the active tab's agent: the checks before a send, a single
 * chunk, auto-pilot start and resume, and the command palette's `:autopilot`.
 */
export function usePlanRunActions({
  repoRoot, plans, openPlan, setOpenPlanId, withBusy, tabs, activeTabId, addTab, confirm, toast,
  ensureGit, implementChunk, startAutopilot, resumeAutopilot, stopAutopilot,
}) {
  // Before typing into the active tab: is there an agent, and is it free?
  // `chunk` is the one about to be sent; auto-pilot adopts a chunk in flight.
  const confirmSend = useCallback(async (plan, chunk) => {
    const agent = getAgentHookState(getTabSession(activeTabId));
    const other = chunk && plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS && c.id !== chunk.id);
    if (!agent) {
      return confirm({
        title: 'No agent detected in this tab',
        description: chunk
          ? 'The chunk prompt is typed into this tab\'s terminal. Launch Claude there first (Ctrl+K), or send anyway if it is already running.'
          // Auto-pilot hears when a chunk ends only through the hook plugin the launcher loads.
          : 'Auto-pilot follows the agent through Lirah\'s hooks, which load when Claude is launched with Ctrl+K. '
            + 'An agent started another way gets the first chunk, then the run pauses.',
        confirmLabel: 'Send anyway',
        destructive: false,
      });
    }
    if (agent.state === 'working' || other) {
      return confirm({
        title: other ? `Chunk ${other.n} is still in progress` : 'The agent is busy',
        description: other
          ? 'Starting another chunk now may mix their changes into one commit.'
          : 'The prompt will be queued behind what the agent is doing.',
        confirmLabel: 'Send anyway',
        destructive: false,
      });
    }
    return true;
  }, [activeTabId, confirm]);

  // Set up the plan's branch and worktrees. Null: setup failed (already said).
  const setUpGit = useCallback(async (plan) => {
    let cfg;
    try {
      cfg = await ensureGit(repoRoot, plan.id);
    } catch (e) {
      toast.error(`Git setup failed — ${e?.message || e}`);
      return null;
    }
    if (cfg.removedAt) {
      toast.error('This plan\'s worktrees were removed');
      return null;
    }
    return cfg;
  }, [ensureGit, repoRoot, toast]);

  // The plan runs in worktrees and the active tab isn't in them.
  const needsOwnTab = useCallback((cfg) => {
    const tabPath = tabs.find((t) => t.id === activeTabId)?.projectPath;
    return !!cfg.worktrees && !inWorkDir({ git: cfg }, tabPath);
  }, [tabs, activeTabId]);

  // Open a tab in the plan's worktrees, launch Claude there and wait for it.
  // The new tab's id, or null.
  const openAgentTab = useCallback(async (cfg) => {
    const tab = addTab(cfg.workDir, { launch: true });
    if (!tab) return null;
    if (!(await agentStarted(tab.id, AGENT_START_TIMEOUT_MS))) {
      toast.error('Claude didn\'t start in the new tab. Launch it there (Ctrl+K), then run auto-pilot from that tab.');
      return null;
    }
    await sleep(AGENT_SETTLE_MS);
    return tab.id;
  }, [addTab, toast]);

  // Set up git, then make sure the active tab works where the plan does.
  // False: don't send (a tab was offered instead).
  const prepareFor = useCallback(async (plan) => {
    const cfg = await setUpGit(plan);
    if (!cfg) return false;
    if (!needsOwnTab(cfg)) return true;
    const ok = await confirm({
      title: 'This plan runs in its worktrees',
      description: `Chunks go to an agent working in ${cfg.workDir}. Open a tab there, launch Claude (Ctrl+K), then send from that tab.`,
      confirmLabel: 'Open tab there',
      destructive: false,
    });
    if (ok) addTab(cfg.workDir);
    return false;
  }, [setUpGit, needsOwnTab, confirm, addTab]);

  const handleImplement = useCallback(async (plan, chunk) => {
    if (!(await withBusy(BUSY.chunk(chunk.id), () => prepareFor(plan)))) return;
    if (!(await confirmSend(plan, chunk))) return;
    await withBusy(BUSY.chunk(chunk.id), () => implementChunk(repoRoot, plan.id, chunk.id, activeTabId));
  }, [activeTabId, confirmSend, prepareFor, withBusy, implementChunk, repoRoot]);

  const handleAutopilot = useCallback(async (plan) => {
    const cfg = await setUpGit(plan);
    if (!cfg) return;
    // In worktrees, from a tab outside them: the run gets a tab of its own.
    const ownTab = needsOwnTab(cfg);
    const clash = !ownTab && plans.find((p) => p.id !== plan.id && isAutopilotLive(p.autopilot) && p.autopilot.tabId === activeTabId);
    if (clash) {
      toast.error(`"${clash.title || UNTITLED_PLAN}" is already on auto-pilot in this tab`);
      return;
    }
    if (!ownTab && !(await confirmSend(plan, null))) return;
    // Changes already in the tree would be swept into the first chunk's commit.
    let dirty = 0;
    for (const repo of planGit({ git: cfg }).repos) {
      dirty += await dirtyCount(workPath(repo)).catch(() => 0);
    }
    const firstRun = !getSettings().autopilotTipSeen;
    const ok = await confirm({
      title: dirty ? `${dirty} uncommitted change${dirty === 1 ? '' : 's'} in the repo` : 'Run the plan on auto-pilot?',
      description: [
        dirty && 'The agent may commit them along with the first chunk. Commit or stash them first to keep chunks clean.',
        ownTab
          ? `A new tab opens in ${cfg.workDir} and launches Claude. Chunks go to that agent one at a time, each committed before the next.`
          : 'Chunks go to this tab\'s agent one at a time, each committed before the next.',
        'You are notified when it finishes, needs you, or hits an error.',
        firstRun && 'Permission prompts pause the run: launch the agent with accept-edits to leave it unattended.',
      ].filter(Boolean).join(' '),
      confirmLabel: dirty ? 'Start anyway' : 'Start auto-pilot',
      destructive: false,
    });
    if (!ok) return;
    setSetting('autopilotTipSeen', true);
    const tabId = ownTab ? await openAgentTab(cfg) : activeTabId;
    if (!tabId) return;
    try {
      await startAutopilot(repoRoot, plan.id, tabId);
    } catch (e) {
      toast.error(`Auto-pilot didn't start: ${e?.message || e}`);
    }
  }, [plans, activeTabId, confirm, confirmSend, setUpGit, needsOwnTab, openAgentTab, startAutopilot, repoRoot, toast]);

  const handleResume = useCallback(async (plan) => {
    // The run's own tab if it is still open, else this one, else a new one in the worktrees.
    let tabId = tabs.some((t) => t.id === plan.autopilot.tabId) ? plan.autopilot.tabId : activeTabId;
    if (tabId === activeTabId) {
      const cfg = await setUpGit(plan);
      if (!cfg) return;
      if (needsOwnTab(cfg)) tabId = await openAgentTab(cfg);
      if (!tabId) return;
    }
    try {
      await resumeAutopilot(repoRoot, plan.id, tabId);
    } catch (e) {
      toast.error(`Auto-pilot didn't resume: ${e?.message || e}`);
    }
  }, [tabs, activeTabId, setUpGit, needsOwnTab, openAgentTab, resumeAutopilot, repoRoot, toast]);

  // `:autopilot` from the command palette: the open plan, else the only plan
  // with a run going, else the only one with work left. The request is taken
  // once (takeAutopilotToggle clears it), so re-running on other changes is a
  // no-op; it waits only for the plans to load.
  const [toggleSeq, setToggleSeq] = useState(0);
  useEffect(() => subscribeAutopilotToggle(() => setToggleSeq((n) => n + 1)), []);
  useEffect(() => {
    if (!plans || !takeAutopilotToggle()) return;
    const only = (list) => (list.length === 1 ? list[0] : null);
    const target = openPlan
      || only(plans.filter((p) => isAutopilotLive(p.autopilot)))
      || only(plans.filter((p) => p.split === SPLIT_STATUS.DONE && nextChunkId(p)));
    if (!target) {
      toast.info('Open a plan, then run :autopilot');
      return;
    }
    setOpenPlanId(target.id);
    if (target.autopilot?.status === AUTOPILOT_STATUS.RUNNING) {
      stopAutopilot(repoRoot, target.id);
      toast.info('Auto-pilot off');
    } else if (target.autopilot?.status === AUTOPILOT_STATUS.PAUSED || target.autopilot?.status === AUTOPILOT_STATUS.FAILED) {
      handleResume(target);
    } else {
      handleAutopilot(target);
    }
  }, [plans, toggleSeq, openPlan, setOpenPlanId, repoRoot, stopAutopilot, handleResume, handleAutopilot, toast]);

  return { prepareFor, handleImplement, handleAutopilot, handleResume };
}
