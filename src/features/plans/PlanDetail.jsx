import { useEffect, useState } from 'react';
import { ChevronLeft, Play, RefreshCw, Trash2 } from 'lucide-react';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { PanelButton } from '../../components/instrument/PanelButton';
import { PlanGitSection } from './PlanGitSection';
import { ProgressReadout, Prose } from './parts';
import { Checkbox } from '../../components/ui/checkbox';
import {
  AUTOPILOT_STATUS, CHUNK_STATUS, isAutopilotLive, nextChunkId, planProgress, planStarted, SPLIT_STATUS, UNTITLED_PLAN,
} from './planModel';
import { AutopilotStrip } from './AutopilotStrip';
import { Fig20Timeline } from './Fig20Timeline';
import { ChunkRow, DoneRun } from './ChunkRow';
import { BUSY, useBusy, usePlanPane } from './PlanPaneContext';
import { usePlansActions } from './PlansContext';
import { planGit } from './planGit';
import { useTabManager } from '../tabs/TabContext';
import { useToast } from '../toast';
import { FrameHints } from '../../components/instrument/FrameHints';
import { subscribePlanChunkCommand, takePlanChunkCommand } from './plansPaneEvents';

// Chunk rows (and folded runs) carry this, so j/k can step between them.
const ROW = '[data-plan-row]';
const LIST_HINTS = [
  { keys: ['j', 'k'], label: 'move' },
  { keys: ['↵'], label: 'open' },
  { keys: ['i'], label: 'implement' },
  { keys: ['s'], label: 'skip' },
  { keys: ['e'], label: 'edit' },
  { keys: ['r'], label: 'review' },
  { keys: ['x'], label: 'delete' },
];

const withId = (set, id) => new Set(set).add(id);
const withoutId = (set, id) => {
  const next = new Set(set);
  next.delete(id);
  return next;
};
// A chunk you closed stays closed until its state changes.
const closeKey = (c) => `${c.id}:${c.status}:${c.awaitingFix ? 1 : 0}`;

// j/k (or the arrows) step between chunk rows while one has focus.
function onListKey(e) {
  if (!e.target.matches?.(ROW) || e.ctrlKey || e.metaKey || e.altKey) return;
  const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[e.key];
  if (!step && e.key !== 'Home' && e.key !== 'End') return;
  const rows = [...e.currentTarget.querySelectorAll(ROW)];
  const i = rows.indexOf(e.target);
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + step));
  e.preventDefault();
  rows[j]?.focus();
  rows[j]?.scrollIntoView({ block: 'nearest' });
}

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
  const toast = useToast();
  const reviewingAll = useBusy(BUSY.REVIEW_ALL);
  const settingUpGit = useBusy(BUSY.GIT_SETUP);
  const resplit = () => runSplit(repoRoot, plan.id);
  const { done, total } = planProgress(plan);
  const nextId = nextChunkId(plan);
  // Start offered when there is work left and no run to resume.
  const canPilot = plan.split === SPLIT_STATUS.DONE && (!plan.autopilot || plan.autopilot.status === AUTOPILOT_STATUS.DONE || plan.autopilot.status === AUTOPILOT_STATUS.OFF)
    && (!!nextId || plan.chunks.some((c) => c.status === CHUNK_STATUS.IN_PROGRESS));
  const piloted = isAutopilotLive(plan.autopilot);
  // The chunks in flight are always open, as are the ones you open; the next
  // one opens on its own only while nothing is in flight. That's where the work is.
  const inFlight = plan.chunks.filter((c) => c.status === CHUNK_STATUS.IN_PROGRESS || c.awaitingFix);
  const auto = inFlight.length > 0 ? inFlight : plan.chunks.filter((c) => c.id === nextId);
  const [opened, setOpened] = useState(() => new Set());
  const [closed, setClosed] = useState(() => new Set());
  const open = new Set([...auto.filter((c) => !closed.has(closeKey(c))).map((c) => c.id), ...opened]);
  const [showSource, setShowSource] = useState(false);
  // Folded runs of finished chunks you've opened back up, by first chunk id.
  const [unfolded, setUnfolded] = useState(() => new Set());
  const started = planStarted(plan);
  const toggle = (chunk) => {
    if (open.has(chunk.id)) {
      setOpened((s) => withoutId(s, chunk.id));
      setClosed((s) => withId(s, closeKey(chunk)));
    } else {
      setOpened((s) => withId(s, chunk.id));
    }
  };

  const reveal = (id, { focus = false } = {}) => requestAnimationFrame(() => {
    const row = document.getElementById(`chunk-${id}`);
    row?.scrollIntoView({ block: 'nearest' });
    if (focus) row?.querySelector(ROW)?.focus({ preventScroll: true });
  });
  // Open a chunk and bring it into view.
  const openChunk = (id, opts) => {
    setOpened((s) => withId(s, id));
    reveal(id, opts);
  };

  // Follow the run: when auto-pilot moves on, its chunk comes into view.
  const pilotChunkId = piloted ? plan.autopilot.chunkId : null;
  useEffect(() => {
    if (pilotChunkId) reveal(pilotChunkId);
  }, [pilotChunkId]);

  // The command palette's `plan next` and `plan implement`.
  const [commandSeq, setCommandSeq] = useState(0);
  useEffect(() => subscribePlanChunkCommand(() => setCommandSeq((n) => n + 1)), []);
  useEffect(() => {
    const action = takePlanChunkCommand();
    if (!action) return;
    const next = plan.chunks.find((c) => c.id === nextId);
    if (!next) {
      toast.info('No chunk left to start in this plan');
      return;
    }
    openChunk(next.id, { focus: true });
    if (action !== 'implement') return;
    if (piloted) toast.info('Auto-pilot is running this plan');
    else pane.implement(plan, next);
  }, [commandSeq]);
  const fileCount = new Set(plan.chunks.flatMap((c) => c.files ?? [])).size;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col px-3 pt-2 pb-3">
        <div className="flex items-center gap-1.5">
          <PanelButton icon={ChevronLeft} onClick={pane.closePlan} title="Back to all plans">plans</PanelButton>
          <span className="ml-auto flex items-center gap-1">
            {/* Pressed, not latched: a view toggle has no lamp to light. */}
            <PanelButton
              aria-pressed={showSource}
              data-latched={showSource || undefined}
              aria-controls="plan-source"
              onClick={() => setShowSource((v) => !v)}
              title="Show the plan as it was pasted"
            >
              source
            </PanelButton>
            {!started && plan.split !== SPLIT_STATUS.RUNNING && (
              <PanelButton onClick={resplit} title="Split the plan again (nothing has started yet)">re-split</PanelButton>
            )}
            <PanelButton icon={Trash2} onClick={() => pane.deletePlan(plan)} title="Delete this plan" aria-label="Delete this plan" />
          </span>
        </div>
        {showSource && (
          <pre id="plan-source" className="ins-well mt-2 max-h-72 overflow-auto whitespace-pre-wrap wrap-anywhere px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {plan.source}
          </pre>
        )}

        {/* Identity first: the title, and what the plan is for. */}
        <h3 className="mt-3 text-[13px] font-semibold leading-snug text-foreground wrap-anywhere">{plan.title || UNTITLED_PLAN}</h3>
        {plan.summary && <Prose text={plan.summary} clamp={3} className="mt-1 text-[11px] leading-relaxed text-muted-foreground" />}

        {/* Where it stands: the route, one stop per chunk. */}
        {total > 0 && (
          <div className="mt-4">
            {/* Full: the timeline, once a chunk has a time; until then the bar.
                A finished run's strip draws it below, so it isn't drawn twice. */}
            {plan.autopilot?.status === AUTOPILOT_STATUS.DONE ? (
              <ProgressReadout plan={plan} done={done} total={total} />
            ) : (
              <Fig20Timeline plan={plan} fallback={<ProgressReadout plan={plan} done={done} total={total} />} />
            )}
          </div>
        )}

        {/* The run bank: the primary key, with its one option beside it. */}
        {(canPilot || isAutopilotLive(plan.autopilot)) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {canPilot && (
              <PanelButton
                icon={Play}
                onClick={() => pane.autopilot(plan)}
                // The plan's one primary key: framed and lamp-lit.
                className="ins-key-primary"
                title="Implement the remaining chunks one after another, unattended"
              >
                run on auto-pilot
              </PanelButton>
            )}
            {/* Read before each chunk, so it can change during a run; then it
                says when the change applies. */}
            <label
              className="flex cursor-pointer items-center gap-1.5 text-[11px] text-foreground"
              title="Auto-pilot clears the agent's context (/clear, or /new in opencode) before each chunk after the first. Later chunks then know earlier ones only from the plan, their decisions and the code."
            >
              <Checkbox
                checked={!!plan.clearBetweenChunks}
                onCheckedChange={(v) => updatePlan(repoRoot, plan.id, { clearBetweenChunks: !!v })}
              />
              fresh context per chunk
              <span className="text-muted-foreground">
                {piloted ? '· applies from the next chunk' : '· /clear before each one'}
              </span>
            </label>
          </div>
        )}
        {plan.autopilot && (
          <div className="mt-3">
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
          </div>
        )}

        {/* Setup: one line under a hairline; the form opens on demand. */}
        <div className="mt-3 pt-2.5 edge-t-engraved">
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
        <div className="flex items-center gap-2 px-3 py-2 edge-t-engraved edge-b-engraved">
          <span className="ins-legend">chunks</span>
          <span aria-hidden="true" className="h-px flex-1 bg-[var(--ins-edge)]" />
          <span className="font-[family-name:var(--font-legend)] text-[11px] tabular-nums text-muted-foreground">
            {plan.chunks.length}{fileCount > 0 && ` · ${fileCount} files`}
          </span>
        </div>
      )}

      <div className="group/list flex flex-col py-1.5" onKeyDown={onListKey}>
        {(() => {
          // An unfolded run keeps its row, as the key that folds it again.
          const rows = chunkSegments(plan.chunks, open).flatMap((seg) => {
            if (!seg.run) return [{ key: seg.key, chunk: seg.chunk }];
            const head = { key: seg.key, run: seg.run, unfolded: unfolded.has(seg.key) };
            return head.unfolded ? [head, ...seg.run.map((chunk) => ({ key: chunk.id, chunk }))] : [head];
          });
          return rows.map((row) => {
            return row.run ? (
              <DoneRun
                key={row.key}
                chunks={row.run}
                unfolded={row.unfolded}
                onToggle={() => setUnfolded((s) => (s.has(row.key) ? withoutId(s, row.key) : withId(s, row.key)))}
              />
            ) : (
              <ChunkRow
                key={row.key}
                plan={plan}
                chunk={row.chunk}
                open={open.has(row.chunk.id)}
                onToggle={() => toggle(row.chunk)}
                primary={!canPilot}
              />
            );
          });
        })()}
        {/* Keys for the list, only while it has focus. */}
        {total > 0 && (
          <div className="hidden flex-wrap items-center gap-x-1 gap-y-1 px-3 pt-2 text-[10px] text-muted-foreground group-focus-within/list:flex">
            <FrameHints hints={LIST_HINTS} />
          </div>
        )}
      </div>
    </div>
  );
}
