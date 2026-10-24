import { useState } from 'react';
import { formatDuration } from '../../lib/formatDuration';
import {
  Check, ChevronDown, ChevronRight, ChevronUp, Eye, GitCommit, Pencil, Play, RefreshCw, RotateCcw, SkipForward, Trash2,
  Undo2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { PanelButton } from '../../components/instrument/PanelButton';
import { Field, Prose } from './parts';
import { CHUNK_STATE, CHUNK_STATUS, effectiveChunkState, isAutopilotLive, nextChunkId } from './planModel';
import { BUSY, useBusy, usePlanPane } from './PlanPaneContext';
import { usePlansActions } from './PlansContext';

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
  [CHUNK_STATE.NO_COMMIT]: 'The agent finished without committing. Check again, commit all changes as this chunk, or reset it.',
  [CHUNK_STATE.FIXING]: 'Review notes sent. Waiting for the fix commit.',
  [CHUNK_STATE.IN_PROGRESS]: 'Sent to the agent. Marked implemented when its commit lands.',
  [CHUNK_STATE.ROLLED_BACK]: 'Reverted. Implement it again or skip it.',
};
const statusNote = (chunk) => STATUS_NOTE[effectiveChunkState(chunk)] ?? null;

const REORDER = 'opacity-0 group-hover/chunk:opacity-100 focus-visible:opacity-100';

export function ChunkRow({ plan, chunk, open, onToggle }) {
  const pane = usePlanPane();
  const { repoRoot } = pane;
  const { updateChunk, moveChunk, deleteChunk } = usePlansActions();
  const busy = useBusy(BUSY.chunk(chunk.id));
  const isNext = chunk.id === nextChunkId(plan);
  const first = plan.chunks[0]?.id === chunk.id;
  const last = plan.chunks.at(-1)?.id === chunk.id;
  const piloted = isAutopilotLive(plan.autopilot);
  const pilotChunk = piloted && chunk.id === plan.autopilot.chunkId;
  const nudged = !!plan.autopilot?.nudged;
  const onPatch = (patch) => updateChunk(repoRoot, plan.id, chunk.id, patch);
  const onMove = (delta) => moveChunk(repoRoot, plan.id, chunk.id, delta);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: chunk.title, details: chunk.details });
  const lamp = chunkLamp(chunk);
  const skipped = chunk.status === CHUNK_STATUS.SKIPPED;
  const startable = chunk.status === CHUNK_STATUS.PENDING || chunk.status === CHUNK_STATUS.ROLLED_BACK;
  const status = STATUS_LABEL[effectiveChunkState(chunk)];
  const implemented = chunk.status === CHUNK_STATUS.IMPLEMENTED;
  const took = implemented && chunk.startedAt && chunk.doneAt
    ? formatDuration(chunk.doneAt - chunk.startedAt) : null;
  const note = pilotChunk && chunk.status === CHUNK_STATUS.IN_PROGRESS
    ? 'Auto-pilot sent this chunk. It moves on to the next one when the commit lands.'
    : statusNote(chunk);

  const startEdit = () => {
    setDraft({ title: chunk.title, details: chunk.details });
    setEditing(true);
  };
  const saveEdit = () => {
    if (draft.title.trim()) onPatch({ title: draft.title.trim(), details: draft.details });
    setEditing(false);
  };

  return (
    <div className="group/chunk flex flex-col edge-b-engraved">
      <button
        onClick={onToggle}
        className="group flex min-w-0 items-start gap-2 px-3 py-2 text-left text-[11px] cursor-pointer hover:bg-foreground/5 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
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
            'min-w-0 flex-1 font-medium leading-4',
            open ? 'wrap-anywhere' : 'line-clamp-2 wrap-anywhere',
            skipped ? 'text-muted-foreground line-through' : implemented && !open ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {chunk.title}
        </span>
        <span className="flex h-4 shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          {pilotChunk && (
            <span className="text-[var(--ins-lamp)]" title={nudged ? 'Auto-pilot asked the agent to commit' : 'Auto-pilot is on this chunk'}>
              {nudged ? 'nudged' : 'auto'}
            </span>
          )}
          {/* Implemented is the lamp's job; the row only says how long it took. */}
          {busy ? <Scanner /> : implemented ? took && (
            <span className="tabular-nums" title={`${status}; took ${took} from sending to commit`}>{took}</span>
          ) : chunk.status !== CHUNK_STATUS.PENDING && (
            <span className="tabular-nums">{status}</span>
          )}
          <span className="text-faint transition-colors group-hover:text-muted-foreground group-focus-visible:text-muted-foreground">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        </span>
      </button>

      {open && (
        // Indented to the chunk number, not the title: the pane is narrow.
        <div className="flex min-w-0 flex-col gap-2.5 pr-3 pb-3 pl-7 text-[11px] leading-relaxed">
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
              {chunk.goal && <Prose text={chunk.goal} className="text-muted-foreground" />}
              {/* Opening a chunk means reading it: details show in full. */}
              {chunk.details && (
                <Field label="details">
                  <Prose text={chunk.details} className="text-muted-foreground" />
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
              {/* Auto-pilot does the sending, checking and committing while it runs. */}
              {startable && !piloted && (
                <PanelButton icon={Play} onClick={() => pane.implement(plan, chunk)} disabled={busy} title="Send this chunk to the tab's agent">
                  implement
                </PanelButton>
              )}
              {chunk.status === CHUNK_STATUS.IN_PROGRESS && !piloted && (
                <>
                  <PanelButton icon={RefreshCw} onClick={() => pane.check(plan, chunk)} disabled={busy} title="Look for the chunk's commit">check</PanelButton>
                  <PanelButton icon={GitCommit} onClick={() => pane.commit(plan, chunk)} disabled={busy} title="Commit all changes as this chunk">
                    commit
                  </PanelButton>
                  <PanelButton icon={Undo2} onClick={() => onPatch({ status: CHUNK_STATUS.PENDING, needsCommit: false })} disabled={busy} title="Back to pending (changes are kept)">
                    reset
                  </PanelButton>
                </>
              )}
              {chunk.status === CHUNK_STATUS.IMPLEMENTED && chunk.commits?.length > 0 && (
                <>
                  <PanelButton icon={Eye} onClick={() => pane.review(plan, chunk)} disabled={busy} title="Review the chunk's diff; notes go back to the agent">
                    review
                  </PanelButton>
                  <PanelButton icon={RotateCcw} onClick={() => pane.rollback(plan, chunk)} disabled={busy} title="git revert the chunk's commits">
                    roll back
                  </PanelButton>
                </>
              )}
              {(chunk.status === CHUNK_STATUS.PENDING || skipped) && (
                <PanelButton
                  icon={SkipForward}
                  // Its lamp only once it is on, so it can't read as a second status.
                  {...(skipped ? { latched: true } : { 'aria-pressed': false })}
                  onClick={() => onPatch({ status: skipped ? CHUNK_STATUS.PENDING : CHUNK_STATUS.SKIPPED })}
                  title="Skipped chunks don't count toward progress"
                >
                  skip
                </PanelButton>
              )}
              {chunk.status === CHUNK_STATUS.PENDING && (
                <span className="ml-auto flex gap-1">
                  <PanelButton icon={Pencil} onClick={startEdit} title="Edit chunk" aria-label="Edit chunk" />
                  {/* Reordering is rare: shown on hover or keyboard focus. */}
                  <PanelButton icon={ChevronUp} onClick={() => onMove(-1)} disabled={first} title="Move up" aria-label="Move up" className={REORDER} />
                  <PanelButton icon={ChevronDown} onClick={() => onMove(1)} disabled={last} title="Move down" aria-label="Move down" className={REORDER} />
                  <PanelButton icon={Trash2} onClick={() => deleteChunk(repoRoot, plan.id, chunk.id)} title="Delete chunk" aria-label="Delete chunk" />
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A run of implemented chunks folded into one row; click to list them. */
export function DoneRun({ chunks, onUnfold }) {
  const first = chunks[0].n;
  const last = chunks.at(-1).n;
  const ms = chunks.reduce((sum, c) => sum + (c.startedAt && c.doneAt ? c.doneAt - c.startedAt : 0), 0);
  return (
    <button
      onClick={onUnfold}
      className="group flex min-w-0 items-center gap-2 px-3 py-2 text-left text-[11px] cursor-pointer edge-b-engraved hover:bg-foreground/5 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
      title={`Show chunks ${first}–${last}`}
    >
      <span className="flex h-4 shrink-0 items-center">
        <Lamp state="ok" label="implemented" />
      </span>
      <span className="w-4 shrink-0" />
      <span className="min-w-0 flex-1 leading-4 text-muted-foreground">
        <span className="tabular-nums">{first}–{last}</span> implemented
        <span className="text-faint"> · {chunks.length} chunks</span>
      </span>
      <span className="flex h-4 shrink-0 items-center gap-1.5 text-[10px]">
        {ms > 0 && <span className="tabular-nums text-faint">{formatDuration(ms)}</span>}
        <span className="text-faint transition-colors group-hover:text-muted-foreground group-focus-visible:text-muted-foreground">
          <ChevronRight className="h-3 w-3" />
        </span>
      </span>
    </button>
  );
}
