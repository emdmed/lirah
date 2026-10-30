import { useState } from 'react';
import { formatDuration } from '../../lib/formatDuration';
import { Check, ChevronDown, ChevronRight, ChevronUp, Play, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { PanelButton } from '../../components/instrument/PanelButton';
import { Field, Prose } from './parts';
import { AUTOPILOT_STATUS, CHUNK_STATE, CHUNK_STATUS, effectiveChunkState, isAutopilotLive, nextChunkId } from './planModel';
import { BUSY, useBusy, usePlanPane } from './PlanPaneContext';
import { usePlansActions } from './PlansContext';
import { useToast } from '../toast';
import { basename } from '../../utils/pathUtils';

const CHUNK_LAMP = {
  [CHUNK_STATE.NO_COMMIT]: { state: 'warn' },
  [CHUNK_STATE.IN_PROGRESS]: { state: 'on', blink: true },
  [CHUNK_STATE.FIXING]: { state: 'on', blink: true },
  [CHUNK_STATE.IMPLEMENTED]: { state: 'ok' },
  [CHUNK_STATE.ROLLED_BACK]: { state: 'warn' },
};
const chunkLamp = (chunk) => CHUNK_LAMP[effectiveChunkState(chunk)] || { state: 'off' };

const STATUS_LABEL = {
  [CHUNK_STATE.PENDING]: 'pending',
  [CHUNK_STATE.IN_PROGRESS]: 'in progress',
  [CHUNK_STATE.IMPLEMENTED]: 'implemented',
  [CHUNK_STATE.ROLLED_BACK]: 'rolled back',
  [CHUNK_STATE.SKIPPED]: 'skipped',
  [CHUNK_STATE.NO_COMMIT]: 'no commit',
  [CHUNK_STATE.FIXING]: 'fixing',
};

// What the state means and what you can do about it, for the states that
// need a word. Pending needs none.
const STATUS_NOTE = {
  [CHUNK_STATE.NO_COMMIT]: 'The agent finished without committing. Check again, commit all changes as this chunk, mark it done if it needed no changes, or reset it.',
  [CHUNK_STATE.FIXING]: 'Review notes sent. Waiting for the fix commit.',
  [CHUNK_STATE.IN_PROGRESS]: 'Sent to the agent. Marked implemented when its commit lands, or when the agent says there was nothing to commit.',
  [CHUNK_STATE.ROLLED_BACK]: 'Reverted. Implement it again or skip it.',
};
const statusNote = (chunk) => STATUS_NOTE[effectiveChunkState(chunk)] ?? null;

const REORDER = 'opacity-0 group-hover/chunk:opacity-100 focus-visible:opacity-100';

// `primary`: the next chunk's implement may be the pane's primary key (only
// when auto-pilot isn't offered, which is then the one).
export function ChunkRow({ plan, chunk, open, onToggle, primary = true }) {
  const pane = usePlanPane();
  const { repoRoot } = pane;
  const { updateChunk, moveChunk, deleteChunk, restoreChunk } = usePlansActions();
  const toast = useToast();
  const busy = useBusy(BUSY.chunk(chunk.id));
  const isNext = chunk.id === nextChunkId(plan);
  const first = plan.chunks[0]?.id === chunk.id;
  const last = plan.chunks.at(-1)?.id === chunk.id;
  const piloted = isAutopilotLive(plan.autopilot);
  const pilotChunk = piloted && chunk.id === plan.autopilot.chunkId;
  // A paused run waits on you, so its chunk can be marked done by hand.
  const pilotRunning = piloted && plan.autopilot.status === AUTOPILOT_STATUS.RUNNING;
  const nudged = !!plan.autopilot?.nudged;
  const onPatch = (patch) => updateChunk(repoRoot, plan.id, chunk.id, patch);
  const onMove = (delta) => moveChunk(repoRoot, plan.id, chunk.id, delta);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: chunk.title, details: chunk.details });
  // The decisions passed on to later chunks, one per line while editing.
  const [decisionsDraft, setDecisionsDraft] = useState(null);
  const editingDecisions = decisionsDraft !== null;
  const skipped = chunk.status === CHUNK_STATUS.SKIPPED;
  const startable = chunk.status === CHUNK_STATUS.PENDING || chunk.status === CHUNK_STATUS.ROLLED_BACK;
  const status = STATUS_LABEL[effectiveChunkState(chunk)];
  const implemented = chunk.status === CHUNK_STATUS.IMPLEMENTED;
  const took = implemented && chunk.startedAt && chunk.doneAt
    ? formatDuration(chunk.doneAt - chunk.startedAt) : null;
  const note = pilotChunk && chunk.status === CHUNK_STATUS.IN_PROGRESS
    ? 'Auto-pilot sent this chunk. It moves on to the next one when the commit lands.'
    : statusNote(chunk);
  const lamp = chunkLamp(chunk);

  const startEdit = () => {
    setDraft({ title: chunk.title, details: chunk.details });
    setEditing(true);
  };
  const saveDecisions = () => {
    const lines = decisionsDraft.split('\n').map((l) => l.replace(/^\s*[-*]?\s*(Decision:\s*)?/i, '').trim()).filter(Boolean);
    onPatch({ decisions: [...new Set(lines)] });
    setDecisionsDraft(null);
  };
  // Deleting renumbers the chunks after it, so it says so and can be undone.
  const remove = () => {
    const index = plan.chunks.findIndex((c) => c.id === chunk.id);
    deleteChunk(repoRoot, plan.id, chunk.id);
    const after = plan.chunks.length - index - 1;
    toast.toast(`Deleted chunk ${chunk.n}${after > 0 ? `; ${after === 1 ? 'the one after it is' : `the ${after} after it are`} renumbered` : ''}`, {
      action: { label: 'undo', onClick: () => restoreChunk(repoRoot, plan.id, chunk, index) },
    });
  };
  const canImplement = startable && !piloted && !busy;
  const canReview = implemented && chunk.commits?.length > 0 && !busy;
  const pending = chunk.status === CHUNK_STATUS.PENDING;
  // Keys on the focused row: i implement, s skip, e edit, r review, x delete.
  const onRowKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || editing || editingDecisions) return;
    const act = {
      i: canImplement && (() => pane.implement(plan, chunk)),
      s: (pending || skipped) && (() => onPatch({ status: skipped ? CHUNK_STATUS.PENDING : CHUNK_STATUS.SKIPPED })),
      e: pending && (() => {
        if (!open) onToggle();
        startEdit();
      }),
      r: canReview && (() => pane.review(plan, chunk)),
      x: pending && remove,
    }[e.key];
    if (!act) return;
    e.preventDefault();
    act();
  };
  const rowKeys = [canImplement && 'i', (pending || skipped) && 's', pending && 'e', canReview && 'r', pending && 'x'].filter(Boolean);
  const saveEdit = () => {
    if (draft.title.trim()) onPatch({ title: draft.title.trim(), details: draft.details });
    setEditing(false);
  };

  return (
    <div id={`chunk-${chunk.id}`} className="group/chunk relative flex flex-col">
      <button
        type="button"
        data-plan-row
        onClick={onToggle}
        onKeyDown={onRowKey}
        aria-keyshortcuts={rowKeys.length ? rowKeys.join(' ') : undefined}
        className="group grid min-w-0 grid-cols-[14px_16px_minmax(0,1fr)_auto] items-start gap-x-1.5 px-3 py-[3px] text-left text-[11px] cursor-pointer hover:bg-foreground/5 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
        aria-expanded={open}
        title={isNext ? 'Next chunk' : undefined}
      >
        <span className="flex h-[18px] w-3.5 items-center justify-center">
          <Lamp state={lamp.state} blink={lamp.blink} label={status} />
        </span>
        <span
          className={cn(
            'text-right font-[family-name:var(--font-legend)] text-[10px] leading-[18px] tabular-nums',
            isNext ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {chunk.n}
        </span>
        <span
          className={cn(
            'min-w-0 leading-[18px]',
            open ? 'font-semibold wrap-anywhere' : 'line-clamp-2 wrap-anywhere',
            skipped ? 'text-muted-foreground line-through' : implemented && !open ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {chunk.title}
        </span>
        <span className="flex h-[18px] items-center gap-1.5 font-[family-name:var(--font-legend)] text-[10px] text-muted-foreground">
          {pilotChunk && (
            <span className="text-[var(--ins-lamp)]" title={nudged ? 'Auto-pilot asked the agent to commit' : 'Auto-pilot is on this chunk'}>
              {nudged ? 'nudged' : 'auto'}
            </span>
          )}
          {busy ? <Scanner /> : implemented ? took && (
            <span className="tabular-nums" title={`${status}; took ${took} from sending to commit`}>{took}</span>
          ) : isNext && chunk.status === CHUNK_STATUS.PENDING ? (
            <span className="text-foreground">next</span>
          ) : chunk.status !== CHUNK_STATUS.PENDING ? (
            <span className="tabular-nums">{status}</span>
          ) : !open && chunk.files?.length > 0 && (
            <span className="tabular-nums">{chunk.files.length} {chunk.files.length === 1 ? 'file' : 'files'}</span>
          )}
        </span>
      </button>

      {open && (
        // Under the title, past the node and number columns.
        <div className="flex min-w-0 flex-col gap-3 pr-3 pt-1 pb-4 pl-[calc(0.75rem+14px+16px+12px)] text-[11px] leading-relaxed">
          {note && <p className="text-[11px] leading-relaxed text-muted-foreground">{note}</p>}
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
              <dl className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-x-2.5 gap-y-3">
                {chunk.goal && <Spec label="goal"><Prose text={chunk.goal} className="text-foreground" /></Spec>}
                {chunk.details && (
                  <Spec label="does"><Prose text={chunk.details} clamp={4} className="text-muted-foreground" /></Spec>
                )}
                {chunk.files?.length > 0 && <Spec label="files"><FileTree files={chunk.files} /></Spec>}
                {chunk.acceptance && <Spec label="check"><CheckCommand text={chunk.acceptance} /></Spec>}
                {chunk.result && (
                  <Spec label="result"><Prose text={chunk.result} clamp={4} className="text-muted-foreground" /></Spec>
                )}
                {editingDecisions ? (
                  <Spec label="decided">
                    <textarea
                      value={decisionsDraft}
                      onChange={(e) => setDecisionsDraft(e.target.value)}
                      rows={Math.max(3, (chunk.decisions?.length ?? 0) + 1)}
                      placeholder="One per line. Later chunks get these in their prompt."
                      className="ins-well w-full resize-y px-1.5 py-1 text-[10px] leading-relaxed text-foreground outline-none"
                      autoFocus
                    />
                    <div className="flex gap-1.5 pt-1">
                      <PanelButton icon={Check} onClick={saveDecisions}>save</PanelButton>
                      <PanelButton onClick={() => setDecisionsDraft(null)}>cancel</PanelButton>
                    </div>
                  </Spec>
                ) : chunk.decisions?.length > 0 && (
                  <Spec label="decided">
                    <ul className="flex flex-col gap-0.5 text-muted-foreground" title="Passed on to later chunks' prompts">
                      {chunk.decisions.map((d) => (
                        <li key={d} className="wrap-anywhere before:mr-1.5 before:text-muted-foreground/60 before:content-['–']">{d}</li>
                      ))}
                    </ul>
                  </Spec>
                )}
                {chunk.commits?.length > 0 && (
                  <Spec label="commits"><CommitList chunk={chunk} /></Spec>
                )}
              </dl>
            </>
          )}

          {!editing && !editingDecisions && (
            <div className="flex flex-wrap items-center gap-1">
              {/* Auto-pilot does the sending, checking and committing while it runs. */}
              {startable && !piloted && (
                <PanelButton
                  icon={Play}
                  onClick={() => pane.implement(plan, chunk)}
                  disabled={busy}
                  className={isNext && primary ? 'ins-key-primary' : undefined}
                  title="Send this chunk to the tab's agent"
                >
                  implement
                </PanelButton>
              )}
              {chunk.status === CHUNK_STATUS.IN_PROGRESS && !piloted && (
                <>
                  <PanelButton onClick={() => pane.check(plan, chunk)} disabled={busy} title="Look for the chunk's commit">check</PanelButton>
                  <PanelButton onClick={() => pane.commit(plan, chunk)} disabled={busy} title="Commit all changes as this chunk">commit</PanelButton>
                  <PanelButton onClick={() => onPatch({ status: CHUNK_STATUS.PENDING, needsCommit: false })} disabled={busy} title="Back to pending (changes are kept)">
                    reset
                  </PanelButton>
                </>
              )}
              {chunk.status === CHUNK_STATUS.IN_PROGRESS && !pilotRunning && (
                <PanelButton onClick={() => pane.markDone(plan, chunk)} disabled={busy} title="Done with nothing to commit (a check, a test run)">
                  mark done
                </PanelButton>
              )}
              {chunk.status === CHUNK_STATUS.IMPLEMENTED && chunk.commits?.length > 0 && (
                <>
                  <PanelButton onClick={() => pane.review(plan, chunk)} disabled={busy} title="Review the chunk's diff; notes go back to the agent">review</PanelButton>
                  <PanelButton onClick={() => pane.rollback(plan, chunk)} disabled={busy} title="git revert the chunk's commits">roll back</PanelButton>
                </>
              )}
              {implemented && (
                <PanelButton
                  onClick={() => setDecisionsDraft((chunk.decisions ?? []).join('\n'))}
                  disabled={busy}
                  title="Edit the decisions passed on to later chunks"
                >
                  decisions
                </PanelButton>
              )}
              {(chunk.status === CHUNK_STATUS.PENDING || skipped) && (
                <PanelButton
                  // Its lamp only once it is on, so it can't read as a second status.
                  {...(skipped ? { latched: true } : { 'aria-pressed': false })}
                  onClick={() => onPatch({ status: skipped ? CHUNK_STATUS.PENDING : CHUNK_STATUS.SKIPPED })}
                  title="Skipped chunks don't count toward progress"
                >
                  skip
                </PanelButton>
              )}
              {chunk.status === CHUNK_STATUS.PENDING && (
                <>
                  <PanelButton onClick={startEdit} title="Edit the chunk's title and details">edit</PanelButton>
                  <span className="ml-auto flex gap-0.5">
                    {/* Reordering is rare: shown on hover or keyboard focus. */}
                    <PanelButton icon={ChevronUp} onClick={() => onMove(-1)} disabled={first} title="Move up" aria-label="Move up" className={REORDER} />
                    <PanelButton icon={ChevronDown} onClick={() => onMove(1)} disabled={last} title="Move down" aria-label="Move down" className={REORDER} />
                    <PanelButton icon={Trash2} onClick={remove} title="Delete chunk (undo in the toast)" aria-label="Delete chunk" />
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One hanging label and its value in the open chunk.
function Spec({ label, children }) {
  return (
    <>
      <dt className="font-[family-name:var(--font-legend)] text-[11px] leading-[16.5px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

// The chunk's files, one per line: directory dimmed, name bright. A flat
// list, so no tree guides: they would draw nesting that isn't there.
function FileTree({ files }) {
  return (
    <ul className="flex min-w-0 flex-col font-mono text-[10px] leading-[16.5px]">
      {files.map((f) => {
        const cut = f.lastIndexOf('/') + 1;
        return (
          <li key={f} className="flex min-w-0" title={f}>
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">{f.slice(0, cut)}</span>
              <span className="text-foreground">{f.slice(cut)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// "Done when": when it leads with a command in backticks, the command gets a
// `$` line of its own (selectable, copyable) and the rest reads as one
// sentence. Anything else stays prose.
function CheckCommand({ text }) {
  const m = text.match(/^\s*(?:run\s+|running\s+)?`([^`\n]+)`\s*(.*)$/is);
  if (!m) return <Prose text={text} clamp={3} className="text-muted-foreground" />;
  const [, cmd, rest] = m;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <code className="ins-well block select-text whitespace-pre-wrap wrap-anywhere px-1.5 py-1 font-mono text-[10px] leading-relaxed text-foreground">
        <span aria-hidden="true" className="text-muted-foreground">$ </span>{cmd}
      </code>
      {rest && <Prose text={rest} clamp={3} className="text-muted-foreground" />}
    </div>
  );
}

// The chunk's short SHAs; with several repos, each repo's under its name, so
// you can tell where a commit landed.
function CommitList({ chunk }) {
  const byRepo = Object.entries(chunk.commitsByRepo ?? {}).filter(([, shas]) => shas?.length > 0);
  const line = (shas) => shas.map((c) => c.slice(0, 7)).join(' · ');
  if (byRepo.length < 2) {
    return <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{line(chunk.commits)}</span>;
  }
  return (
    <ul className="flex flex-col font-mono text-[10px] tabular-nums">
      {byRepo.map(([root, shas]) => (
        <li key={root} className="min-w-0 truncate" title={root}>
          <span className="text-foreground">{basename(root)}</span>
          <span className="text-muted-foreground"> {line(shas)}</span>
        </li>
      ))}
    </ul>
  );
}

/** A run of implemented chunks folded into one row; click to list them, again to fold. */
export function DoneRun({ chunks, onToggle, unfolded = false }) {
  const first = chunks[0].n;
  const last = chunks.at(-1).n;
  const ms = chunks.reduce((sum, c) => sum + (c.startedAt && c.doneAt ? c.doneAt - c.startedAt : 0), 0);
  return (
    <div className="relative">
      <button
        type="button"
        data-plan-row
        onClick={onToggle}
        aria-expanded={unfolded}
        className="group grid w-full min-w-0 grid-cols-[14px_16px_minmax(0,1fr)_auto] items-start gap-x-1.5 px-3 py-[3px] text-left text-[11px] cursor-pointer hover:bg-foreground/5 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
        title={unfolded ? `Fold chunks ${first}–${last}` : `Show chunks ${first}–${last}`}
      >
        <span className="flex h-[18px] w-3.5 items-center justify-center">
          <Lamp state="ok" label="implemented" />
        </span>
        <span />
        <span className="min-w-0 leading-[18px] text-muted-foreground">
          <span className="tabular-nums">{first}–{last}</span> implemented · {chunks.length} chunks
        </span>
        <span className="flex h-[18px] items-center gap-1.5 font-[family-name:var(--font-legend)] text-[10px] text-muted-foreground">
          {ms > 0 && <span className="tabular-nums">{formatDuration(ms)}</span>}
          <ChevronRight aria-hidden="true" className={cn('h-3 w-3 opacity-60 group-hover:opacity-100', unfolded && 'rotate-90')} />
        </span>
      </button>
    </div>
  );
}
