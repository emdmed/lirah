import { useState } from 'react';
import { ChevronLeft, FileText, Plane, RefreshCw, Trash2 } from 'lucide-react';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { PanelButton } from '../../components/instrument/PanelButton';
import { PlanGitSection } from './PlanGitSection';
import { ProgressReadout, Prose } from './parts';
import {
  AUTOPILOT_STATUS, CHUNK_STATUS, isAutopilotLive, nextChunkId, planProgress, planStarted, SPLIT_STATUS, UNTITLED_PLAN,
} from './planModel';
import { AutopilotStrip } from './AutopilotStrip';
import { ChunkRow } from './ChunkRow';

// The `busy` id while the whole plan's diff is being gathered.
export const REVIEW_ALL = 'review-all';
// The `busy` id while the git settings are being changed.
export const GIT_SETUP = 'git-setup';

export function PlanDetail({
  plan, busy, onBack, onResplit, onDelete, onGitChange, onAddRepo, onRemoveRepo, onOpenWorkTab, onRemoveWorktrees, autopilotTabOpen, onAutopilot, onResumeAutopilot, onStopAutopilot,
  onDismissAutopilot, onGoToTab, onReviewAll, onImplement, onCheck, onCommit, onReview, onRollback, onPatchChunk, onMoveChunk, onDeleteChunk,
}) {
  const { done, total } = planProgress(plan);
  const nextId = nextChunkId(plan);
  const piloted = isAutopilotLive(plan.autopilot);
  // Start offered when there is work left and no run to resume.
  const canPilot = plan.split === SPLIT_STATUS.DONE && (!plan.autopilot || plan.autopilot.status === AUTOPILOT_STATUS.DONE || plan.autopilot.status === AUTOPILOT_STATUS.OFF)
    && (!!nextId || plan.chunks.some((c) => c.status === CHUNK_STATUS.IN_PROGRESS));
  // Until you fold or unfold something, the chunks in flight and the next one
  // are open: that's where the work is.
  const auto = new Set(plan.chunks.filter((c) => c.status === CHUNK_STATUS.IN_PROGRESS || c.awaitingFix).map((c) => c.id));
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
        <div className="flex flex-wrap items-center gap-1.5">
          <PanelButton icon={ChevronLeft} onClick={onBack} title="Back to all plans">plans</PanelButton>
          <PanelButton icon={FileText} latched={showSource} onClick={() => setShowSource((v) => !v)} title="Show the plan as it was pasted">
            source
          </PanelButton>
          {!started && plan.split !== SPLIT_STATUS.RUNNING && (
            <PanelButton icon={RefreshCw} onClick={onResplit} title="Split the plan again (nothing has started yet)">
              re-split
            </PanelButton>
          )}
          <PanelButton icon={Trash2} onClick={onDelete} title="Delete this plan" aria-label="Delete this plan" className="ml-auto" />
        </div>
        <h3 className="text-xs font-medium leading-snug text-foreground wrap-anywhere">{plan.title || UNTITLED_PLAN}</h3>
        {total > 0 && <ProgressReadout plan={plan} done={done} total={total} />}
        {plan.autopilot && (
          <AutopilotStrip
            plan={plan}
            tabOpen={autopilotTabOpen}
            busy={busy === REVIEW_ALL}
            onResume={onResumeAutopilot}
            onStop={onStopAutopilot}
            onDismiss={onDismissAutopilot}
            onGoToTab={onGoToTab}
            onReviewAll={onReviewAll}
          />
        )}
        {canPilot && (
          <PanelButton
            icon={Plane}
            onClick={onAutopilot}
            className="self-start"
            title="Implement the remaining chunks one after another, unattended"
          >
            run on auto-pilot
          </PanelButton>
        )}
        {plan.summary && <Prose text={plan.summary} clamp={3} className="text-[11px] leading-relaxed text-muted-foreground" />}
        <PlanGitSection
          plan={plan}
          busy={busy === GIT_SETUP}
          onChange={onGitChange}
          onAddRepo={onAddRepo}
          onRemoveRepo={onRemoveRepo}
          onOpenTab={onOpenWorkTab}
          onRemoveWorktrees={onRemoveWorktrees}
        />
      </div>

      {showSource && (
        <pre className="ins-well mx-3 my-2 max-h-72 overflow-auto whitespace-pre-wrap wrap-anywhere px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {plan.source}
        </pre>
      )}

      {plan.split === SPLIT_STATUS.RUNNING && (
        <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-muted-foreground">
          <Scanner size="md" />
          splitting into chunks…
        </div>
      )}
      {plan.split === SPLIT_STATUS.FAILED && (
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
          piloted={piloted}
          pilotChunk={piloted && chunk.id === plan.autopilot.chunkId}
          nudged={!!plan.autopilot?.nudged}
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
