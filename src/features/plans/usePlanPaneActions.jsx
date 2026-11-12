import { useCallback, useMemo, useState } from 'react';
import { errorMessage } from '../../lib/errorMessage';
import { useConfirm } from '../dialogs/DialogProvider';
import { useToast } from '../toast';
import { useTabManager } from '../tabs/TabContext';
import { usePlansActions } from './PlansContext';
import { planGit } from './planGit';
import { uncommittedFiles } from './planGitOps';
import { basename } from '../../utils/pathUtils';
import { BUSY } from './PlanPaneContext';
import { usePlanRunActions } from './usePlanRunActions';
import { usePlanReview } from './usePlanReview';

/**
 * The plans pane's handlers for PlanPaneProvider (confirm, set up git or toast
 * before calling the store), the action in flight, the plans waiting for
 * their terminal's Claude to start, and the review's diff
 * dialog props. Shared by the plans pane and Zen's plan drawer.
 */
export function usePlanPaneActions({ repoRoot, plans, openPlan, setOpenPlanId }) {
  const {
    deletePlan, implementChunk, checkChunk, markChunkDone, commitChunk, rollbackChunk, sendFix, sendPlanFix, startAutopilot,
    resumeAutopilot, stopAutopilot, addPlanRepo, ensureGit, removeWorktrees, reopenGit, sendPlanRevise, rechunk, updatePlan,
  } = usePlansActions();
  const { tabs, activeTabId, addTab, wakeTab, switchTab, togglePlanTerminal } = useTabManager();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(null); // the BUSY key of the action in flight

  const withBusy = useCallback(async (key, fn) => {
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const { prepareFor, confirmSend, handleImplement, handleAutopilot, handleResume, starting, cancelStart } = usePlanRunActions({
    repoRoot, plans, openPlan, setOpenPlanId, withBusy, tabs, activeTabId, addTab, wakeTab, switchTab, confirm, toast,
    ensureGit, updatePlan, implementChunk, startAutopilot, resumeAutopilot, stopAutopilot,
  });
  const { handleReview, handleReviewAll, diffProps } = usePlanReview({
    repoRoot, plans, withBusy, prepareFor, sendFix, sendPlanFix, toast,
  });

  const handleCheck = useCallback((plan, chunk) => withBusy(BUSY.chunk(chunk.id), async () => {
    const res = await checkChunk(repoRoot, plan.id, chunk.id);
    if (res.error) throw new Error(res.error);
    if (!res.found) toast.info(`No commit for chunk ${chunk.n} yet`);
  }), [withBusy, checkChunk, repoRoot, toast]);

  const handleMarkDone = useCallback((plan, chunk) => withBusy(BUSY.chunk(chunk.id), async () => {
    const res = await markChunkDone(repoRoot, plan.id, chunk.id);
    if (res.error) throw new Error(res.error);
    if (res.found) toast.info(`Chunk ${chunk.n}'s commit was found`);
  }), [withBusy, markChunkDone, repoRoot, toast]);

  const handleCommit = useCallback(async (plan, chunk) => {
    // Name what git add -A will sweep in, so unrelated edits aren't a surprise.
    const files = await uncommittedFiles(plan).catch(() => null);
    if (files && files.length === 0) {
      toast.info(`Nothing to commit for chunk ${chunk.n}: the tree is clean. Mark it done if it needed no changes.`);
      return;
    }
    const multi = files && new Set(files.map((f) => f.root)).size > 1;
    const SHOWN = 8;
    const list = files
      ? `${files.slice(0, SHOWN).map((f) => `  ${multi ? `${basename(f.root)}/` : ''}${f.path}`).join('\n')}${files.length > SHOWN ? `\n  +${files.length - SHOWN} more` : ''}`
      : null;
    const ok = await confirm({
      title: `Commit ${files ? `${files.length} ${files.length === 1 ? 'file' : 'files'}` : 'all changes'} as chunk ${chunk.n}?`,
      description: (
        <span className="flex flex-col gap-2">
          <span>Stages every change in the repo (git add -A) and commits it with this chunk&apos;s message.</span>
          {list && <span className="block whitespace-pre font-mono text-[11px] leading-relaxed text-foreground">{list}</span>}
        </span>
      ),
      confirmLabel: 'Commit',
      destructive: false,
    });
    if (!ok) return;
    await withBusy(BUSY.chunk(chunk.id), async () => {
      const res = await commitChunk(repoRoot, plan.id, chunk.id);
      if (!res.found) throw new Error('Nothing was committed — are there any changes?');
    });
  }, [confirm, withBusy, commitChunk, repoRoot, toast]);

  const handleRollback = useCallback(async (plan, chunk) => {
    const n = chunk.commits.length;
    const ok = await confirm({
      title: `Roll back chunk ${chunk.n}?`,
      description: `Reverts its ${n} commit${n === 1 ? '' : 's'} with git revert, as new commits. Later chunks that build on it may break. Uncommitted changes to the same files make the revert fail.`,
      confirmLabel: 'Roll back',
    });
    if (!ok) return;
    await withBusy(BUSY.chunk(chunk.id), async () => {
      await rollbackChunk(repoRoot, plan.id, chunk.id);
      toast.success(`Chunk ${chunk.n} rolled back`);
    });
  }, [confirm, withBusy, rollbackChunk, repoRoot, toast]);

  const handleDeletePlan = useCallback(async (plan) => {
    const cfg = planGit(plan);
    const worktrees = cfg.worktrees && cfg.worktreesDir && !cfg.removedAt;
    const ok = await confirm({
      title: `Delete the plan "${plan.title || UNTITLED_PLAN}"?`,
      description: worktrees
        ? 'Its chunks and progress are removed from ~/.lirah/plans, and its worktrees are removed with any uncommitted work in them. Commits and branches stay.'
        : 'Its chunks and progress are removed from ~/.lirah/plans. Commits stay in the repo.',
      confirmLabel: 'Delete plan',
    });
    if (!ok) return;
    setOpenPlanId(null);
    await deletePlan(repoRoot, plan.id);
  }, [confirm, deletePlan, repoRoot]);

  const handleAddRepo = useCallback((plan, path) => withBusy(BUSY.GIT_SETUP, () => addPlanRepo(repoRoot, plan.id, path)),
    [withBusy, addPlanRepo, repoRoot]);

  const handleRemoveWorktrees = useCallback(async (plan) => {
    const ok = await confirm({
      title: 'Remove the plan\'s worktrees?',
      description: 'Uncommitted work in them is lost. The branches and their commits stay, and the plan can no longer send chunks.',
      confirmLabel: 'Remove worktrees',
    });
    if (!ok) return;
    await withBusy(BUSY.GIT_SETUP, () => removeWorktrees(repoRoot, plan.id));
  }, [confirm, withBusy, removeWorktrees, repoRoot]);

  const handleReopenGit = useCallback(async (plan) => {
    const cfg = planGit(plan);
    if (cfg.worktrees && !cfg.removedAt) {
      const ok = await confirm({
        title: 'Change the plan\'s git setup?',
        description: 'Its worktrees are removed so they can be made again with the new setup. Uncommitted work in them is lost; the branch stays.',
        confirmLabel: 'Remove and change',
      });
      if (!ok) return false;
    }
    try {
      await withBusy(BUSY.GIT_SETUP, () => reopenGit(repoRoot, plan.id));
      return true;
    } catch (e) {
      toast.error(`Couldn't reopen the git setup — ${e?.message || e}`);
      return false;
    }
  }, [confirm, withBusy, reopenGit, repoRoot, toast]);

  // Typed into the plan's tab, so ask first when no agent is there or it is busy.
  const handleRevise = useCallback(async (plan, notes) => {
    const tabId = await withBusy(BUSY.REVISE, () => prepareFor(plan));
    if (!tabId) return false;
    if (!(await confirmSend(plan, null, tabId))) return false;
    const sent = await withBusy(BUSY.REVISE, async () => {
      await sendPlanRevise(repoRoot, plan.id, notes, tabId);
      return true;
    });
    if (sent) toast.success('Sent. Re-chunk once the agent has updated the plan file.');
    return !!sent;
  }, [prepareFor, confirmSend, withBusy, sendPlanRevise, repoRoot, toast]);

  const handleRechunk = useCallback((plan) => withBusy(BUSY.REVISE, () => rechunk(repoRoot, plan.id)),
    [withBusy, rechunk, repoRoot]);

  // Flip the tab between its terminal and the plan's, opening the plan's
  // (setting up git and launching Claude, shown) when it's closed.
  const handleOpenPlanTab = useCallback((plan) => {
    if (!togglePlanTerminal(plan.tabId)) withBusy(BUSY.GIT_SETUP, () => prepareFor(plan));
  }, [togglePlanTerminal, withBusy, prepareFor]);

  const closePlan = useCallback(() => setOpenPlanId(null), []);
  const paneActions = useMemo(() => ({
    repoRoot,
    closePlan,
    implement: handleImplement,
    check: handleCheck,
    markDone: handleMarkDone,
    commit: handleCommit,
    review: handleReview,
    rollback: handleRollback,
    autopilot: handleAutopilot,
    resume: handleResume,
    reviewAll: handleReviewAll,
    deletePlan: handleDeletePlan,
    addRepo: handleAddRepo,
    removeWorktrees: handleRemoveWorktrees,
    reopenGit: handleReopenGit,
    revise: handleRevise,
    rechunk: handleRechunk,
    openPlanTab: handleOpenPlanTab,
    cancelStart,
  }), [repoRoot, closePlan, handleImplement, handleCheck, handleMarkDone, handleCommit, handleReview, handleRollback, handleAutopilot,
    handleResume, handleReviewAll, handleDeletePlan, handleAddRepo, handleRemoveWorktrees, handleReopenGit, handleRevise, handleRechunk, handleOpenPlanTab, cancelStart]);

  return { busy, starting, paneActions, diffProps };
}
