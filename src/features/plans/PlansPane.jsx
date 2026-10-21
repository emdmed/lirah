import { Suspense, useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../lib/errorMessage';
import { Plus } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { dirtyCount, repoTop } from '../../lib/git';
import { lazyNamed } from '../../lib/lazyNamed';
import { Scanner } from '../../components/instrument/Scanner';
import { useConfirm } from '../confirm/ConfirmContext';
import { useToast } from '../toast';
import { useTabManager } from '../tabs/TabContext';
import { getTabSession } from '../tabs/terminalActivity';
import { getAgentHookState } from '../tabs/agentHookState';
import { usePlans } from './PlansContext';
import { usePlanFiles } from './usePlanFiles';
import { FoundPlansSection } from './FoundPlansSection';
import { EmptyLine } from './parts';
import { chunkReviewRanges, planReviewRanges, reviewOf } from './planGitOps';
import {
  AUTOPILOT_STATUS, CHUNK_STATUS, isAutopilotLive, nextChunkId, runRank, SPLIT_STATUS, UNTITLED_PLAN,
} from './planModel';
import { inWorkDir, isMultiRepo, planGit, planWorktreeOwner, workPath } from './planGit';
import { subscribeAutopilotToggle, subscribePlanFocus, takeAutopilotToggle, takePlanFocus } from './plansPaneEvents';
import { GIT_SETUP, PlanDetail, REVIEW_ALL } from './PlanDetail';
import { PlanRow } from './PlanRow';

const GitDiffDialog = lazyNamed(() => import('../git/GitDiffDialog'), 'GitDiffDialog');
const NewPlanDialog = lazyNamed(() => import('./NewPlanDialog'), 'NewPlanDialog');

const AUTOPILOT_TIP_KEY = 'lirah:autopilot-tip-seen';

// The repo and refs to diff the review's current file against.
function reviewRange(review) {
  const r = review.ranges.find((x) => review.filePath?.startsWith(`${x.path}/`)) || review.ranges[0];
  return { repoPath: r.path, baseRef: r.baseRef, headRef: r.headRef };
}

function readFlag(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function writeFlag(key) {
  try { localStorage.setItem(key, '1'); } catch { /* per-viewer nicety only */ }
}

// A tab inside a plan's worktrees shows the plans of the repo that owns them.
async function resolveRepoRoot(projectPath) {
  const home = await invoke('get_home_dir').catch(() => null);
  const owner = home ? await planWorktreeOwner(home, projectPath) : null;
  if (owner) return owner;
  return repoTop(projectPath);
}

function useRepoRoot(projectPath) {
  const [repoRoot, setRepoRoot] = useState(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setChecked(false);
    if (!projectPath) return;
    resolveRepoRoot(projectPath)
      .then((root) => !cancelled && setRepoRoot(root))
      .catch(() => !cancelled && setRepoRoot(null))
      .finally(() => !cancelled && setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [projectPath]);
  return { repoRoot, checked };
}

/** The plans of the active tab's repo: a list, or one plan's chunks. */
export function PlansPane({ projectPath }) {
  const { repoRoot, checked } = useRepoRoot(projectPath);
  const {
    plans, createPlan, replaceSource, runSplit, deletePlan, updateChunk, moveChunk, deleteChunk, implementChunk,
    checkChunk, commitChunk, rollbackChunk, sendFix, sendPlanFix, startAutopilot, resumeAutopilot, stopAutopilot,
    dismissAutopilot, setGitConfig, addPlanRepo, removePlanRepo, ensureGit, removeWorktrees,
  } = usePlans(repoRoot);
  const { files, importFile } = usePlanFiles({ repoRoot, plans, createPlan, replaceSource });
  const { tabs, activeTabId, switchTab, addTab } = useTabManager();
  const confirm = useConfirm();
  const toast = useToast();

  const [openPlanId, setOpenPlanId] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(null); // chunk id (or REVIEW_ALL) with an action in flight
  // { planId, chunkId (null: the whole plan), files, filePath, baseRef, headRef }
  const [review, setReview] = useState(null);
  const [notes, setNotes] = useState([]);
  const [sendingNotes, setSendingNotes] = useState(false);

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

  const withBusy = useCallback(async (chunkId, fn) => {
    setBusy(chunkId);
    try {
      return await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const handleCreate = useCallback(async ({ source, importedFrom }) => {
    try {
      const id = await createPlan(repoRoot, { source, importedFrom });
      setOpenPlanId(id);
    } catch (e) {
      toast.error(`Couldn't create the plan: ${e?.message || e}`);
    }
  }, [createPlan, repoRoot, toast]);

  // Before typing into the active tab: is there an agent, and is it free?
  // `chunk` is the one about to be sent; auto-pilot adopts a chunk in flight.
  const confirmSend = useCallback(async (plan, chunk) => {
    const agent = getAgentHookState(getTabSession(activeTabId));
    const other = chunk && plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS && c.id !== chunk.id);
    if (!agent) {
      return confirm({
        title: 'No agent detected in this tab',
        description: 'The chunk prompt is typed into this tab\'s terminal. Launch Claude there first (Ctrl+K), or send anyway if it is already running.',
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

  // Set up the plan's branch and worktrees, then make sure the active tab
  // works where the plan does. False: don't send (a tab was offered instead).
  const prepareFor = useCallback(async (plan) => {
    let cfg;
    try {
      cfg = await ensureGit(repoRoot, plan.id);
    } catch (e) {
      toast.error(`Git setup failed — ${e?.message || e}`);
      return false;
    }
    if (cfg.removedAt) {
      toast.error('This plan\'s worktrees were removed');
      return false;
    }
    const tabPath = tabs.find((t) => t.id === activeTabId)?.projectPath;
    if (!cfg.worktrees || inWorkDir({ git: cfg }, tabPath)) return true;
    const ok = await confirm({
      title: 'This plan runs in its worktrees',
      description: `Chunks go to an agent working in ${cfg.workDir}. Open a tab there, launch Claude (Ctrl+K), then send from that tab.`,
      confirmLabel: 'Open tab there',
      destructive: false,
    });
    if (ok) addTab(cfg.workDir);
    return false;
  }, [ensureGit, repoRoot, tabs, activeTabId, confirm, addTab, toast]);

  const handleImplement = useCallback(async (plan, chunk) => {
    if (!(await withBusy(chunk.id, () => prepareFor(plan)))) return;
    if (!(await confirmSend(plan, chunk))) return;
    await withBusy(chunk.id, () => implementChunk(repoRoot, plan.id, chunk.id, activeTabId));
  }, [activeTabId, confirmSend, prepareFor, withBusy, implementChunk, repoRoot]);

  const handleAutopilot = useCallback(async (plan) => {
    const clash = plans.find((p) => p.id !== plan.id && isAutopilotLive(p.autopilot) && p.autopilot.tabId === activeTabId);
    if (clash) {
      toast.error(`"${clash.title || UNTITLED_PLAN}" is already on auto-pilot in this tab`);
      return;
    }
    if (!(await prepareFor(plan))) return;
    if (!(await confirmSend(plan, null))) return;
    // Changes already in the tree would be swept into the first chunk's commit.
    let dirty = 0;
    for (const repo of planGit(plan).repos) {
      dirty += await dirtyCount(workPath(repo)).catch(() => 0);
    }
    const firstRun = !readFlag(AUTOPILOT_TIP_KEY);
    const ok = await confirm({
      title: dirty ? `${dirty} uncommitted change${dirty === 1 ? '' : 's'} in the repo` : 'Run the plan on auto-pilot?',
      description: [
        dirty && 'The agent may commit them along with the first chunk. Commit or stash them first to keep chunks clean.',
        'Chunks go to this tab\'s agent one at a time, each committed before the next. You are notified when it finishes, needs you, or hits an error.',
        firstRun && 'Permission prompts pause the run: launch the agent with accept-edits to leave it unattended.',
      ].filter(Boolean).join(' '),
      confirmLabel: dirty ? 'Start anyway' : 'Start auto-pilot',
      destructive: false,
    });
    if (!ok) return;
    writeFlag(AUTOPILOT_TIP_KEY);
    try {
      await startAutopilot(repoRoot, plan.id, activeTabId);
    } catch (e) {
      toast.error(`Auto-pilot didn't start: ${e?.message || e}`);
    }
  }, [plans, activeTabId, confirm, confirmSend, prepareFor, startAutopilot, repoRoot, toast]);

  const handleResume = useCallback(async (plan) => {
    // The run's own tab if it is still open, else this one.
    const tabId = tabs.some((t) => t.id === plan.autopilot.tabId) ? plan.autopilot.tabId : activeTabId;
    if (tabId === activeTabId && !(await prepareFor(plan))) return;
    try {
      await resumeAutopilot(repoRoot, plan.id, tabId);
    } catch (e) {
      toast.error(`Auto-pilot didn't resume: ${e?.message || e}`);
    }
  }, [tabs, activeTabId, prepareFor, resumeAutopilot, repoRoot, toast]);

  // `:autopilot` from the command palette: the open plan, else the only plan
  // with a run going, else the only one with work left.
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
  // Only on a palette request (or the plans it was waiting for).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, toggleSeq]);

  const handleCheck = useCallback((plan, chunk) => withBusy(chunk.id, async () => {
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
    await withBusy(chunk.id, async () => {
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
    await withBusy(chunk.id, async () => {
      await rollbackChunk(repoRoot, plan.id, chunk.id);
      toast.success(`Chunk ${chunk.n} rolled back`);
    });
  }, [confirm, withBusy, rollbackChunk, repoRoot, toast]);

  const handleReview = useCallback((plan, chunk) => withBusy(chunk.id, async () => {
    const review = await reviewOf(chunkReviewRanges(plan, chunk));
    if (review.files.length === 0) throw new Error('That commit changed no files');
    setNotes([]);
    setReview({ planId: plan.id, chunkId: chunk.id, ...review });
  }), [withBusy]);

  // Everything the plan's chunks committed, as one diff: from before the first
  // chunk started to the last chunk's last commit, limited to their files.
  const handleReviewAll = useCallback((plan) => withBusy(REVIEW_ALL, async () => {
    const ranges = planReviewRanges(plan);
    if (ranges.length === 0) throw new Error('No committed chunks to review');
    const review = await reviewOf(ranges);
    if (review.files.length === 0) throw new Error('The plan\'s commits changed no files');
    setNotes([]);
    setReview({ planId: plan.id, chunkId: null, ...review });
  }), [withBusy]);

  const handleSendNotes = useCallback(async () => {
    if (!review || notes.length === 0) return;
    const plan = plans?.find((p) => p.id === review.planId);
    if (plan && !(await prepareFor(plan))) return;
    // Paths within one repo are ambiguous once the plan spans several.
    const sent = plan && isMultiRepo(plan) ? notes.map((n) => ({ ...n, relPath: n.filePath })) : notes;
    setSendingNotes(true);
    try {
      if (review.chunkId) await sendFix(repoRoot, review.planId, review.chunkId, sent, activeTabId);
      else await sendPlanFix(repoRoot, review.planId, sent, activeTabId);
      setReview(null);
      setNotes([]);
      toast.success('Review notes sent to the agent');
    } catch (e) {
      toast.error(`Notes not sent: ${e?.message || e}`);
    } finally {
      setSendingNotes(false);
    }
  }, [review, notes, plans, prepareFor, sendFix, sendPlanFix, repoRoot, activeTabId, toast]);

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

  const handleAddRepo = useCallback((plan, path) => withBusy(GIT_SETUP, () => addPlanRepo(repoRoot, plan.id, path)),
    [withBusy, addPlanRepo, repoRoot]);

  const handleRemoveWorktrees = useCallback(async (plan) => {
    const ok = await confirm({
      title: 'Remove the plan\'s worktrees?',
      description: 'Uncommitted work in them is lost. The branches and their commits stay, and the plan can no longer send chunks.',
      confirmLabel: 'Remove worktrees',
    });
    if (!ok) return;
    await withBusy(GIT_SETUP, () => removeWorktrees(repoRoot, plan.id));
  }, [confirm, withBusy, removeWorktrees, repoRoot]);

  if (!projectPath || (checked && !repoRoot)) {
    return <EmptyLine hint="plans track commits, so they need a git repository">not a git repo</EmptyLine>;
  }
  if (!plans) {
    return <div className="flex justify-center py-4"><Scanner size="md" label="Loading plans" /></div>;
  }

  return (
    <>
      {openPlan ? (
        <PlanDetail
          plan={openPlan}
          busy={busy}
          onBack={() => setOpenPlanId(null)}
          onResplit={() => runSplit(repoRoot, openPlan.id)}
          onDelete={() => handleDeletePlan(openPlan)}
          onGitChange={(patch) => setGitConfig(repoRoot, openPlan.id, patch)}
          onAddRepo={(path) => handleAddRepo(openPlan, path)}
          onRemoveRepo={(root) => removePlanRepo(repoRoot, openPlan.id, root)}
          onOpenWorkTab={() => addTab(planGit(openPlan).workDir)}
          onRemoveWorktrees={() => handleRemoveWorktrees(openPlan)}
          autopilotTabOpen={tabs.some((t) => t.id === openPlan.autopilot?.tabId)}
          onAutopilot={() => handleAutopilot(openPlan)}
          onResumeAutopilot={() => handleResume(openPlan)}
          onStopAutopilot={() => stopAutopilot(repoRoot, openPlan.id)}
          onDismissAutopilot={() => dismissAutopilot(repoRoot, openPlan.id)}
          onReviewAll={() => handleReviewAll(openPlan)}
          onGoToTab={() => switchTab(openPlan.autopilot.tabId)}
          onImplement={(c) => handleImplement(openPlan, c)}
          onCheck={(c) => handleCheck(openPlan, c)}
          onCommit={(c) => handleCommit(openPlan, c)}
          onReview={(c) => handleReview(openPlan, c)}
          onRollback={(c) => handleRollback(openPlan, c)}
          onPatchChunk={(c, patch) => updateChunk(repoRoot, openPlan.id, c.id, patch)}
          onMoveChunk={(c, delta) => moveChunk(repoRoot, openPlan.id, c.id, delta)}
          onDeleteChunk={(c) => deleteChunk(repoRoot, openPlan.id, c.id)}
        />
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
        {review && (
          <div className="fixed inset-0 z-50">
            <GitDiffDialog
              open
              onOpenChange={(o) => !o && setReview(null)}
              filePath={review.filePath}
              {...reviewRange(review)}
              changedFiles={review.files}
              onFileChange={(filePath) => setReview((r) => ({ ...r, filePath }))}
              annotations={notes}
              onAddAnnotation={(note) => setNotes((list) => [...list, { ...note, id: `${Date.now()}-${list.length}` }])}
              onRemoveAnnotation={(id) => setNotes((list) => list.filter((n) => n.id !== id))}
              onSendAnnotations={handleSendNotes}
              sendingAnnotations={sendingNotes}
            />
          </div>
        )}
      </Suspense>
    </>
  );
}
