import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../lib/errorMessage';
import { Plus } from 'lucide-react';
import { lazyNamed } from '../../lib/lazyNamed';
import { Scanner } from '../../components/instrument/Scanner';
import { useConfirm } from '../confirm/ConfirmContext';
import { useToast } from '../toast';
import { useTabManager } from '../tabs/TabContext';
import { usePlans } from './PlansContext';
import { usePlanFiles } from './usePlanFiles';
import { FoundPlansSection } from './FoundPlansSection';
import { EmptyLine } from './parts';
import { runRank, UNTITLED_PLAN } from './planModel';
import { planGit } from './planGit';
import { useRepoRoot } from './planRepoRoot';
import { subscribePlanFocus, takePlanFocus } from './plansPaneEvents';
import { PlanDetail } from './PlanDetail';
import { BUSY, PlanPaneProvider } from './PlanPaneContext';
import { PlanRow } from './PlanRow';
import { usePlanRunActions } from './usePlanRunActions';
import { usePlanReview } from './usePlanReview';

const GitDiffDialog = lazyNamed(() => import('../git/GitDiffDialog'), 'GitDiffDialog');
const NewPlanDialog = lazyNamed(() => import('./NewPlanDialog'), 'NewPlanDialog');

/** The plans of the active tab's repo: a list, or one plan's chunks. */
export function PlansPane({ projectPath }) {
  const { repoRoot, checked } = useRepoRoot(projectPath);
  const {
    plans, createPlan, replaceSource, deletePlan, implementChunk, checkChunk, commitChunk, rollbackChunk, sendFix,
    sendPlanFix, startAutopilot, resumeAutopilot, stopAutopilot, addPlanRepo, ensureGit, removeWorktrees,
  } = usePlans(repoRoot);
  const { files, importFile } = usePlanFiles({ repoRoot, plans, createPlan, replaceSource });
  const { tabs, activeTabId, addTab } = useTabManager();
  const confirm = useConfirm();
  const toast = useToast();

  const [openPlanId, setOpenPlanId] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(null); // the BUSY key of the action in flight

  const openPlan = plans?.find((p) => p.id === openPlanId) || null;
  useEffect(() => setOpenPlanId(null), [repoRoot]);

  // A plan asked for by a notification or the status bar, once its repo's
  // plans are here (after the reset above, so it wins on a tab switch).
  const [focusSeq, setFocusSeq] = useState(0);
  useEffect(() => subscribePlanFocus(() => setFocusSeq((n) => n + 1)), []);
  useEffect(() => {
    const id = takePlanFocus(plans);
    if (id) setOpenPlanId(id);
  }, [plans, focusSeq]);

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

  const { prepareFor, handleImplement, handleAutopilot, handleResume } = usePlanRunActions({
    repoRoot, plans, openPlan, setOpenPlanId, withBusy, tabs, activeTabId, addTab, confirm, toast,
    ensureGit, implementChunk, startAutopilot, resumeAutopilot, stopAutopilot,
  });
  const { handleReview, handleReviewAll, diffProps } = usePlanReview({
    repoRoot, plans, withBusy, prepareFor, sendFix, sendPlanFix, activeTabId, toast,
  });

  const handleCreate = useCallback(async ({ source, importedFrom }) => {
    try {
      const id = await createPlan(repoRoot, { source, importedFrom });
      setOpenPlanId(id);
    } catch (e) {
      toast.error(`Couldn't create the plan: ${e?.message || e}`);
    }
  }, [createPlan, repoRoot, toast]);

  const handleCheck = useCallback((plan, chunk) => withBusy(BUSY.chunk(chunk.id), async () => {
    const res = await checkChunk(repoRoot, plan.id, chunk.id);
    if (res.error) throw new Error(res.error);
    if (!res.found) toast.info(`No commit for chunk ${chunk.n} yet`);
  }), [withBusy, checkChunk, repoRoot, toast]);

  const handleCommit = useCallback(async (plan, chunk) => {
    const ok = await confirm({
      title: `Commit all changes as chunk ${chunk.n}?`,
      description: 'Stages every change in the repo (git add -A) and commits it with this chunk\'s message.',
      confirmLabel: 'Commit',
      destructive: false,
    });
    if (!ok) return;
    await withBusy(BUSY.chunk(chunk.id), async () => {
      const res = await commitChunk(repoRoot, plan.id, chunk.id);
      if (!res.found) throw new Error('Nothing was committed — are there any changes?');
    });
  }, [confirm, withBusy, commitChunk, repoRoot]);

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

  const closePlan = useCallback(() => setOpenPlanId(null), []);
  const paneActions = useMemo(() => ({
    repoRoot,
    closePlan,
    implement: handleImplement,
    check: handleCheck,
    commit: handleCommit,
    review: handleReview,
    rollback: handleRollback,
    autopilot: handleAutopilot,
    resume: handleResume,
    reviewAll: handleReviewAll,
    deletePlan: handleDeletePlan,
    addRepo: handleAddRepo,
    removeWorktrees: handleRemoveWorktrees,
  }), [repoRoot, closePlan, handleImplement, handleCheck, handleCommit, handleReview, handleRollback, handleAutopilot,
    handleResume, handleReviewAll, handleDeletePlan, handleAddRepo, handleRemoveWorktrees]);

  if (!projectPath || (checked && !repoRoot)) {
    return <EmptyLine hint="plans track commits, so they need a git repository">not a git repo</EmptyLine>;
  }
  if (!plans) {
    return <div className="flex justify-center py-4"><Scanner size="md" label="Loading plans" /></div>;
  }

  return (
    <>
      {openPlan ? (
        <PlanPaneProvider busy={busy} actions={paneActions}>
          <PlanDetail plan={openPlan} />
        </PlanPaneProvider>
      ) : (
        <>
          <FoundPlansSection files={files} importFile={importFile} />
          {plans.length === 0 ? (
            <EmptyLine hint="paste a plan and an agent splits it into chunks you implement one commit at a time">
              no plans
            </EmptyLine>
          ) : (
            <div className="flex flex-col">
              {[...plans].sort((a, b) => runRank(a) - runRank(b)).map((plan) => (
                <PlanRow key={plan.id} plan={plan} onOpen={() => setOpenPlanId(plan.id)} />
              ))}
            </div>
          )}
          <button
            onClick={() => setNewOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] text-muted-foreground hover:text-sidebar-foreground cursor-pointer transition-colors"
          >
            <Plus className="h-3 w-3" />
            new plan
          </button>
        </>
      )}

      <Suspense fallback={null}>
        {newOpen && <NewPlanDialog open onOpenChange={setNewOpen} onCreate={handleCreate} />}
        {diffProps && (
          <div className="fixed inset-0 z-50">
            <GitDiffDialog {...diffProps} />
          </div>
        )}
      </Suspense>
    </>
  );
}
