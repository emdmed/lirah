import { useState } from 'react';
import { ChevronLeft, Eraser, FileText, Plane, RefreshCw, Trash2 } from 'lucide-react';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { PanelButton } from '../../components/instrument/PanelButton';
import { PlanGitSection } from './PlanGitSection';
import { ProgressReadout, Prose } from './parts';
import {
  AUTOPILOT_STATUS, CHUNK_STATUS, isAutopilotLive, nextChunkId, planProgress, planStarted, SPLIT_STATUS, UNTITLED_PLAN,
} from './planModel';
import { AutopilotStrip } from './AutopilotStrip';
import { ChunkRow, DoneRun } from './ChunkRow';
import { BUSY, useBusy, usePlanPane } from './PlanPaneContext';
import { usePlansActions } from './PlansContext';
import { planGit } from './planGit';
import { useTabManager } from '../tabs/TabContext';

// Consecutive implemented chunks fold into one row, so finished work recedes
// and the list leads with what's left. A chunk you've opened stays its own row.
function chunkSegments(chunks, open) {
  const segs = [];
  let run = [];
  const flush = () => {
    if (run.length >= 2) segs.push({ key: `run:${run[0].id}`, run });
    else run.forEach((chunk) => segs.push({ key: chunk.id, chunk }));
    run = [];
  };
  for (const chunk of chunks) {
    if (chunk.status === CHUNK_STATUS.IMPLEMENTED && !open.has(chunk.id)) run.push(chunk);
    else {
      flush();
      segs.push({ key: chunk.id, chunk });
    }
  }
  flush();
  return segs;
}

export function PlanDetail({ plan }) {
  const pane = usePlanPane();
  const { repoRoot } = pane;
  const { runSplit, setGitConfig, removePlanRepo, stopAutopilot, dismissAutopilot, updatePlan } = usePlansActions();
  const { tabs, switchTab, addTab } = useTabManager();
  const reviewingAll = useBusy(BUSY.REVIEW_ALL);
  const settingUpGit = useBusy(BUSY.GIT_SETUP);
  const resplit = () => runSplit(repoRoot, plan.id);
  const { done, total } = planProgress(plan);
  const nextId = nextChunkId(plan);
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
  // Folded runs of finished chunks you've opened back up, by first chunk id.
  const [unfolded, setUnfolded] = useState(() => new Set());
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
          <PanelButton icon={ChevronLeft} onClick={pane.closePlan} title="Back to all plans">plans</PanelButton>
          <span className="ml-auto flex items-center gap-1.5">
            <PanelButton icon={FileText} latched={showSource} onClick={() => setShowSource((v) => !v)} title="Show the plan as it was pasted">
              source
            </PanelButton>
            {!started && plan.split !== SPLIT_STATUS.RUNNING && (
              <PanelButton icon={RefreshCw} onClick={resplit} title="Split the plan again (nothing has started yet)">
                re-split
              </PanelButton>
            )}
            <PanelButton icon={Trash2} onClick={() => pane.deletePlan(plan)} title="Delete this plan" aria-label="Delete this plan" />
          </span>
        </div>
        {/* Identity first: the title, and what the plan is for. */}
        <div className="flex flex-col gap-1 pt-1">
          <h3 className="text-[13px] font-medium leading-snug text-foreground wrap-anywhere">{plan.title || UNTITLED_PLAN}</h3>
          {plan.summary && <Prose text={plan.summary} clamp={3} className="text-[11px] leading-relaxed text-muted-foreground" />}
        </div>
        {/* Where it stands: progress, and the way to run the rest. */}
        {(total > 0 || canPilot) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1.5">
            {total > 0 && <ProgressReadout plan={plan} done={done} total={total} />}
            {/* Read before each chunk, so it can change during a run. */}
            {(canPilot || isAutopilotLive(plan.autopilot)) && (
              <PanelButton
                icon={Eraser}
                latched={!!plan.clearBetweenChunks}
                onClick={() => updatePlan(repoRoot, plan.id, { clearBetweenChunks: !plan.clearBetweenChunks })}
                className="ml-auto"
                title="Auto-pilot clears the agent's context (/clear, or /new in opencode) before each chunk after the first. Later chunks then know earlier ones only from the plan, their decisions and the code."
              >
                clear between chunks
              </PanelButton>
            )}
            {canPilot && (
              <PanelButton
                icon={Plane}
                onClick={() => pane.autopilot(plan)}
                // The plan's one primary key: framed and lamp-lit.
                className="ins-key-primary"
                title="Implement the remaining chunks one after another, unattended"
              >
                run on auto-pilot
              </PanelButton>
            )}
          </div>
        )}
        {plan.autopilot && (
          <AutopilotStrip
            plan={plan}
            tabOpen={tabs.some((t) => t.id === plan.autopilot?.tabId)}
            busy={reviewingAll}
            onResume={() => pane.resume(plan)}
            onStop={() => stopAutopilot(repoRoot, plan.id)}
            onDismiss={() => dismissAutopilot(repoRoot, plan.id)}
            onGoToTab={() => switchTab(plan.autopilot.tabId)}
            onReviewAll={() => pane.reviewAll(plan)}
          />
        )}
        {/* Setup: set apart by a hairline. */}
        <div className="mt-1 pt-2.5 edge-t-engraved">
        <PlanGitSection
          plan={plan}
          busy={settingUpGit}
          onChange={(patch) => setGitConfig(repoRoot, plan.id, patch)}
          onAddRepo={(path) => pane.addRepo(plan, path)}
          onRemoveRepo={(root) => removePlanRepo(repoRoot, plan.id, root)}
          onOpenTab={() => addTab(planGit(plan).workDir)}
          onRemoveWorktrees={() => pane.removeWorktrees(plan)}
        />
        </div>
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
          <PanelButton icon={RefreshCw} onClick={resplit}>re-split</PanelButton>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 edge-b-engraved">
          {/* The count is the header's progress readout; not repeated here. */}
          <span className="engraved-label">chunks</span>
        </div>
      )}

      {chunkSegments(plan.chunks, open).map((seg) => (seg.run && !unfolded.has(seg.key) ? (
        <DoneRun key={seg.key} chunks={seg.run} onUnfold={() => setUnfolded((s) => new Set(s).add(seg.key))} />
      ) : (seg.run ?? [seg.chunk]).map((chunk) => (
        <ChunkRow key={chunk.id} plan={plan} chunk={chunk} open={open.has(chunk.id)} onToggle={() => toggle(chunk.id)} />
      ))))}
    </div>
  );
}
