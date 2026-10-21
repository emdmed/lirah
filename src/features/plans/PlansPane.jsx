import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, FileText, GitCommit, Pencil, Play, Plus, RefreshCw,
  RotateCcw, SkipForward, Trash2, Undo2,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { lazyNamed } from '../../lib/lazyNamed';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { PanelButton } from '../../components/instrument/PanelButton';
import { useConfirm } from '../confirm/ConfirmContext';
import { useToast } from '../toast';
import { useTabManager } from '../tabs/TabContext';
import { getTabSession } from '../tabs/terminalActivity';
import { getAgentHookState } from '../tabs/agentHookState';
import { usePlans, planProgress, planStarted } from './PlansContext';
import { usePlanFiles } from './usePlanFiles';
import { FoundPlansSection } from './FoundPlansSection';

const GitDiffDialog = lazyNamed(() => import('../git/GitDiffDialog'), 'GitDiffDialog');
const NewPlanDialog = lazyNamed(() => import('./NewPlanDialog'), 'NewPlanDialog');

function chunkLamp(chunk) {
  if (chunk.status === 'in-progress') return chunk.needsCommit ? { state: 'warn' } : { state: 'on', blink: true };
  if (chunk.status === 'implemented') return chunk.awaitingFix ? { state: 'on', blink: true } : { state: 'ok' };
  if (chunk.status === 'rolled-back') return { state: 'warn' };
  return { state: 'off' };
}

const STATUS_LABEL = {
  pending: 'pending',
  'in-progress': 'in progress',
  implemented: 'implemented',
  'rolled-back': 'rolled back',
  skipped: 'skipped',
};

function useRepoRoot(projectPath) {
  const [repoRoot, setRepoRoot] = useState(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setChecked(false);
    if (!projectPath) return;
    invoke('run_git_command', { repoPath: projectPath, args: ['rev-parse', '--show-toplevel'] })
      .then((out) => !cancelled && setRepoRoot(out.trim() || null))
      .catch(() => !cancelled && setRepoRoot(null))
      .finally(() => !cancelled && setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [projectPath]);
  return { repoRoot, checked };
}

function EmptyLine({ children, hint }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2 text-[11px]">
      <div className="text-foreground">
        <span className="text-muted-foreground">-- </span>
        {children}
        <span className="text-muted-foreground"> --</span>
      </div>
      {hint && <div className="leading-relaxed text-muted-foreground"># {hint}</div>}
    </div>
  );
}

/** The plans of the active tab's repo: a list, or one plan's chunks. */
export function PlansPane({ projectPath }) {
  const { repoRoot, checked } = useRepoRoot(projectPath);
  const {
    plans, createPlan, replaceSource, runSplit, deletePlan, updateChunk, moveChunk, deleteChunk, implementChunk,
    checkChunk, commitChunk, rollbackChunk, sendFix,
  } = usePlans(repoRoot);
  const { files, importFile } = usePlanFiles({ repoRoot, plans, createPlan, replaceSource });
  const { activeTabId } = useTabManager();
  const confirm = useConfirm();
  const toast = useToast();

  const [openPlanId, setOpenPlanId] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(null); // chunk id with an action in flight
  const [review, setReview] = useState(null); // { planId, chunkId, files, filePath, baseRef, headRef }
  const [notes, setNotes] = useState([]);
  const [sendingNotes, setSendingNotes] = useState(false);

  const openPlan = plans?.find((p) => p.id === openPlanId) || null;
  useEffect(() => setOpenPlanId(null), [repoRoot]);

  const withBusy = useCallback(async (chunkId, fn) => {
    setBusy(chunkId);
    try {
      return await fn();
    } catch (e) {
      toast.error(String(e?.message || e));
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

  const handleImplement = useCallback(async (plan, chunk) => {
    const session = getTabSession(activeTabId);
    const agent = getAgentHookState(session);
    const other = plan.chunks.find((c) => c.status === 'in-progress' && c.id !== chunk.id);
    if (!agent) {
      const ok = await confirm({
        title: 'No agent detected in this tab',
        description: 'The chunk prompt is typed into this tab\'s terminal. Launch Claude there first (Ctrl+K), or send anyway if it is already running.',
        confirmLabel: 'Send anyway',
        destructive: false,
      });
      if (!ok) return;
    } else if (agent.state === 'working' || other) {
      const ok = await confirm({
        title: other ? `Chunk ${other.n} is still in progress` : 'The agent is busy',
        description: other
          ? 'Starting another chunk now may mix their changes into one commit.'
          : 'The prompt will be queued behind what the agent is doing.',
        confirmLabel: 'Send anyway',
        destructive: false,
      });
      if (!ok) return;
    }
    await withBusy(chunk.id, () => implementChunk(repoRoot, plan.id, chunk.id, activeTabId));
  }, [activeTabId, confirm, withBusy, implementChunk, repoRoot]);

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
    const baseRef = `${chunk.commits[0]}^`;
    const headRef = chunk.commits.at(-1);
    // Only files the chunk's own commits touched: unrelated commits can land
    // between a chunk and its fix.
    const out = await invoke('run_git_command', {
      repoPath: repoRoot, args: ['show', '--name-only', '--format=', ...chunk.commits],
    });
    const changed = [...new Set(out.split('\n').map((l) => l.trim()).filter(Boolean))].map((rel) => `${repoRoot}/${rel}`);
    if (changed.length === 0) throw new Error('That commit changed no files');
    setNotes([]);
    setReview({ planId: plan.id, chunkId: chunk.id, files: changed, filePath: changed[0], baseRef, headRef });
  }), [withBusy, repoRoot]);

  const handleSendNotes = useCallback(async () => {
    if (!review || notes.length === 0) return;
    setSendingNotes(true);
    try {
      await sendFix(repoRoot, review.planId, review.chunkId, notes, activeTabId);
      setReview(null);
      setNotes([]);
      toast.success('Review notes sent to the agent');
    } catch (e) {
      toast.error(`Notes not sent: ${e?.message || e}`);
    } finally {
      setSendingNotes(false);
    }
  }, [review, notes, sendFix, repoRoot, activeTabId, toast]);

  const handleDeletePlan = useCallback(async (plan) => {
    const ok = await confirm({
      title: `Delete the plan "${plan.title || 'Untitled plan'}"?`,
      description: 'Its chunks and progress are removed from ~/.lirah/plans. Commits stay in the repo.',
      confirmLabel: 'Delete plan',
    });
    if (!ok) return;
    deletePlan(repoRoot, plan.id);
    setOpenPlanId(null);
  }, [confirm, deletePlan, repoRoot]);

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
              {plans.map((plan) => (
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
              repoPath={repoRoot}
              baseRef={review.baseRef}
              headRef={review.headRef}
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

// Agent-written prose: `code` spans read brighter, and long text folds to a
// few lines behind a [more] toggle so one chunk can't fill the pane.
const CLAMP = { 3: 'line-clamp-3', 4: 'line-clamp-4' };

function Prose({ text, clamp, className }) {
  const [full, setFull] = useState(false);
  const long = clamp && (text.length > clamp * 70 || text.split('\n').length > clamp);
  const parts = text.split(/`([^`\n]+)`/);
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      {/* wrap-anywhere (not break-words) lets long paths and identifiers shrink
          the min-content width, so they wrap instead of widening the pane. */}
      <p
        className={cn('whitespace-pre-wrap wrap-anywhere', long && !full && CLAMP[clamp])}
      >
        {parts.map((part, i) =>
          i % 2 ? <code key={i} className="text-foreground">{part}</code> : part
        )}
      </p>
      {long && (
        <button
          onClick={() => setFull((v) => !v)}
          className="tui-btn self-start text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
          aria-expanded={full}
        >
          {full ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="engraved-label">{label}</span>
      {children}
    </div>
  );
}

// One cell per chunk, coloured by its state, so progress also shows where the
// plan stands: what's in, what's in flight, what was rolled back. (Meter would
// read a finished plan as a fault.)
const CELL = {
  implemented: 'bg-[var(--ins-ok)]',
  'in-progress': 'bg-[var(--ins-lamp)]',
  'rolled-back': 'bg-[var(--ins-warn)]',
  pending: 'bg-[var(--ins-lamp-off)]',
  skipped: 'shadow-[inset_0_0_0_1px_var(--ins-edge)]',
};

function ProgressReadout({ plan, done, total }) {
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${done} of ${total} chunks implemented`}>
      <div className="flex h-1.5 min-w-0 flex-1 gap-px">
        {plan.chunks.map((c) => (
          <span key={c.id} className={cn('min-w-px max-w-6 flex-1', CELL[c.status] || CELL.pending)} />
        ))}
      </div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        <span className={done > 0 ? 'text-foreground' : undefined}>{done}</span>/{total}
      </span>
    </div>
  );
}

function PlanRow({ plan, onOpen }) {
  const { done, total } = planProgress(plan);
  const running = plan.chunks.some((c) => c.status === 'in-progress' || c.awaitingFix);
  return (
    <button
      onClick={onOpen}
      className="flex flex-col gap-1.5 px-3 py-2.5 text-left text-[11px] cursor-pointer edge-b-engraved hover:bg-foreground/5 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="flex h-4 shrink-0 items-center">
          {plan.split === 'running' ? (
            <Scanner />
          ) : (
            <Lamp
              state={plan.split === 'failed' ? 'fault' : running ? 'on' : total > 0 && done === total ? 'ok' : 'off'}
              blink={running}
            />
          )}
        </span>
        <span className="line-clamp-2 leading-4 text-foreground">{plan.title || 'Untitled plan'}</span>
        {plan.split !== 'done' && (
          <span className="ml-auto shrink-0 text-[10px] leading-4 text-muted-foreground">
            {plan.split === 'running' ? 'splitting' : 'split failed'}
          </span>
        )}
      </div>
      {plan.split === 'done' && total > 0 && <ProgressReadout plan={plan} done={done} total={total} />}
    </button>
  );
}

// The chunk to do next: the first one not yet implemented or skipped.
function nextChunkId(plan) {
  return plan.chunks.find((c) => c.status === 'pending' || c.status === 'rolled-back')?.id ?? null;
}

function PlanDetail({
  plan, busy, onBack, onResplit, onDelete, onImplement, onCheck, onCommit, onReview, onRollback, onPatchChunk,
  onMoveChunk, onDeleteChunk,
}) {
  const { done, total } = planProgress(plan);
  const nextId = nextChunkId(plan);
  // Until you fold or unfold something, the chunks in flight and the next one
  // are open: that's where the work is.
  const auto = new Set(plan.chunks.filter((c) => c.status === 'in-progress' || c.awaitingFix).map((c) => c.id));
  if (nextId) auto.add(nextId);
  const [expanded, setExpanded] = useState(null);
  const open = expanded ?? auto;
  const [showSource, setShowSource] = useState(false);
  const started = planStarted(plan);
  const toggle = (id) => setExpanded((s) => {
    const next = new Set(s ?? auto);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 px-3 pt-2 pb-2.5 edge-b-engraved">
        <div className="flex items-center gap-1.5">
          <PanelButton icon={ChevronLeft} onClick={onBack} title="Back to all plans">plans</PanelButton>
          <PanelButton icon={FileText} latched={showSource} onClick={() => setShowSource((v) => !v)} title="Show the plan as it was pasted">
            source
          </PanelButton>
          {!started && plan.split !== 'running' && (
            <PanelButton icon={RefreshCw} onClick={onResplit} title="Split the plan again (nothing has started yet)">
              re-split
            </PanelButton>
          )}
          <PanelButton icon={Trash2} onClick={onDelete} title="Delete this plan" aria-label="Delete this plan" className="ml-auto" />
        </div>
        <h3 className="text-xs font-medium leading-snug text-foreground wrap-anywhere">{plan.title || 'Untitled plan'}</h3>
        {total > 0 && <ProgressReadout plan={plan} done={done} total={total} />}
        {plan.summary && <Prose text={plan.summary} clamp={3} className="text-[11px] leading-relaxed text-muted-foreground" />}
      </div>

      {showSource && (
        <pre className="ins-well mx-3 my-2 max-h-72 overflow-auto whitespace-pre-wrap wrap-anywhere px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {plan.source}
        </pre>
      )}

      {plan.split === 'running' && (
        <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-muted-foreground">
          <Scanner size="md" />
          splitting into chunks…
        </div>
      )}
      {plan.split === 'failed' && (
        <div className="flex flex-col items-start gap-1.5 px-3 py-2.5 text-[11px]">
          <span className="flex items-center gap-2 text-foreground"><Lamp state="fault" /> split failed</span>
          <span className="break-words text-[10px] leading-relaxed text-muted-foreground">{plan.splitError}</span>
          <PanelButton icon={RefreshCw} onClick={onResplit}>re-split</PanelButton>
        </div>
      )}

      {plan.chunks.map((chunk, i) => (
        <ChunkRow
          key={chunk.id}
          chunk={chunk}
          isNext={chunk.id === nextId}
          first={i === 0}
          last={i === plan.chunks.length - 1}
          open={open.has(chunk.id)}
          busy={busy === chunk.id}
          onToggle={() => toggle(chunk.id)}
          onImplement={() => onImplement(chunk)}
          onCheck={() => onCheck(chunk)}
          onCommit={() => onCommit(chunk)}
          onReview={() => onReview(chunk)}
          onRollback={() => onRollback(chunk)}
          onPatch={(patch) => onPatchChunk(chunk, patch)}
          onMove={(delta) => onMoveChunk(chunk, delta)}
          onDelete={() => onDeleteChunk(chunk)}
        />
      ))}
    </div>
  );
}

// What the state means and what you can do about it, for the states that
// need a word. Pending needs none.
function statusNote(chunk) {
  if (chunk.needsCommit) return 'The agent finished without committing. Check again, commit all changes as this chunk, or reset it.';
  if (chunk.awaitingFix) return 'Review notes sent. Waiting for the fix commit.';
  if (chunk.status === 'in-progress') return 'Sent to the agent. Marked implemented when its commit lands.';
  if (chunk.status === 'rolled-back') return 'Reverted. Implement it again or skip it.';
  return null;
}

function ChunkRow({
  chunk, isNext, first, last, open, busy, onToggle, onImplement, onCheck, onCommit, onReview, onRollback, onPatch,
  onMove, onDelete,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: chunk.title, details: chunk.details });
  const lamp = chunkLamp(chunk);
  const skipped = chunk.status === 'skipped';
  const startable = chunk.status === 'pending' || chunk.status === 'rolled-back';
  const status = chunk.needsCommit ? 'no commit' : chunk.awaitingFix ? 'fixing' : STATUS_LABEL[chunk.status];
  const note = statusNote(chunk);

  const startEdit = () => {
    setDraft({ title: chunk.title, details: chunk.details });
    setEditing(true);
  };
  const saveEdit = () => {
    if (draft.title.trim()) onPatch({ title: draft.title.trim(), details: draft.details });
    setEditing(false);
  };

  return (
    <div className="flex flex-col edge-b-engraved">
      <button
        onClick={onToggle}
        className="flex min-w-0 items-start gap-2 px-3 py-2 text-left text-[11px] cursor-pointer hover:bg-foreground/5 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
        aria-expanded={open}
        title={isNext ? 'Next chunk' : undefined}
      >
        <span className="flex h-4 shrink-0 items-center">
          <Lamp state={lamp.state} blink={lamp.blink} label={status} />
        </span>
        <span
          className={cn(
            'w-4 shrink-0 text-right font-mono text-[10px] leading-4 tabular-nums',
            isNext ? 'text-[var(--ins-lamp)]' : 'text-muted-foreground',
          )}
        >
          {chunk.n}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 leading-4',
            open ? 'wrap-anywhere' : 'line-clamp-2 wrap-anywhere',
            skipped ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          {chunk.title}
        </span>
        <span className="flex h-4 shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          {busy ? <Scanner /> : chunk.status !== 'pending' && <span>{status}</span>}
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
      </button>

      {open && (
        <div className="flex min-w-0 flex-col gap-2.5 pr-3 pb-3 pl-[51px] text-[11px] leading-relaxed">
          {note && <p className="text-[10px] leading-relaxed text-muted-foreground">{note}</p>}
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <Field label="title">
                <input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  className="ins-well h-6 px-1.5 text-[11px] text-foreground outline-none"
                  autoFocus
                />
              </Field>
              <Field label="details">
                <textarea
                  value={draft.details}
                  onChange={(e) => setDraft((d) => ({ ...d, details: e.target.value }))}
                  rows={8}
                  className="ins-well resize-y px-1.5 py-1 text-[10px] leading-relaxed text-foreground outline-none"
                />
              </Field>
              <div className="flex gap-1.5 pt-0.5">
                <PanelButton icon={Check} onClick={saveEdit}>save</PanelButton>
                <PanelButton onClick={() => setEditing(false)}>cancel</PanelButton>
              </div>
            </div>
          ) : (
            <>
              {chunk.goal && <Prose text={chunk.goal} className="text-foreground" />}
              {chunk.details && (
                <Field label="details">
                  <Prose text={chunk.details} clamp={4} className="text-muted-foreground" />
                </Field>
              )}
              {chunk.files?.length > 0 && (
                <Field label="files">
                  <div className="flex flex-wrap gap-1">
                    {chunk.files.map((f) => (
                      <span key={f} title={f} className="ins-well max-w-full truncate px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                        {f}
                      </span>
                    ))}
                  </div>
                </Field>
              )}
              {chunk.acceptance && (
                <Field label="done when">
                  <Prose text={chunk.acceptance} clamp={3} className="text-muted-foreground" />
                </Field>
              )}
              {chunk.commits?.length > 0 && (
                <Field label="commits">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {chunk.commits.map((c) => c.slice(0, 7)).join(' · ')}
                  </span>
                </Field>
              )}
            </>
          )}

          {!editing && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {startable && (
                <PanelButton icon={Play} onClick={onImplement} disabled={busy} title="Send this chunk to the tab's agent">
                  implement
                </PanelButton>
              )}
              {chunk.status === 'in-progress' && (
                <>
                  <PanelButton icon={RefreshCw} onClick={onCheck} disabled={busy} title="Look for the chunk's commit">check</PanelButton>
                  <PanelButton icon={GitCommit} onClick={onCommit} disabled={busy} title="Commit all changes as this chunk">
                    commit
                  </PanelButton>
                  <PanelButton icon={Undo2} onClick={() => onPatch({ status: 'pending', needsCommit: false })} disabled={busy} title="Back to pending (changes are kept)">
                    reset
                  </PanelButton>
                </>
              )}
              {chunk.status === 'implemented' && chunk.commits?.length > 0 && (
                <>
                  <PanelButton icon={Eye} onClick={onReview} disabled={busy} title="Review the chunk's diff; notes go back to the agent">
                    review
                  </PanelButton>
                  <PanelButton icon={RotateCcw} onClick={onRollback} disabled={busy} title="git revert the chunk's commits">
                    roll back
                  </PanelButton>
                </>
              )}
              {(chunk.status === 'pending' || skipped) && (
                <PanelButton
                  icon={SkipForward}
                  latched={skipped}
                  onClick={() => onPatch({ status: skipped ? 'pending' : 'skipped' })}
                  title="Skipped chunks don't count toward progress"
                >
                  skip
                </PanelButton>
              )}
              {chunk.status === 'pending' && (
                <span className="ml-auto flex gap-1">
                  <PanelButton icon={Pencil} onClick={startEdit} title="Edit chunk" aria-label="Edit chunk" />
                  <PanelButton icon={ChevronUp} onClick={() => onMove(-1)} disabled={first} title="Move up" aria-label="Move up" />
                  <PanelButton icon={ChevronDown} onClick={() => onMove(1)} disabled={last} title="Move down" aria-label="Move down" />
                  <PanelButton icon={Trash2} onClick={onDelete} title="Delete chunk" aria-label="Delete chunk" />
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
