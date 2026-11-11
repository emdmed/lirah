import { useEffect, useState } from 'react';
import { NavArrowLeft, Play, Refresh, Terminal } from 'iconoir-react';
import { Lamp } from '../../components/instrument/Lamp';
import { SpanRuler, SpanScale } from '../../components/instrument/Span';
import { Scanner } from '../../components/instrument/Scanner';
import { PanelButton } from '../../components/instrument/PanelButton';
import { PlanGitSection } from './PlanGitSection';
import { ProgressReadout, Prose, Section } from './parts';
import { Checkbox } from '../../components/ui/checkbox';
import {
  AUTOPILOT_STATUS, CHUNK_STATUS, isAutopilotLive, nextChunkId, PLAN_STAGE, planLifecycle, shortDate, planProgress, planStarted, SPLIT_STATUS,
  UNTITLED_PLAN,
} from './planModel';
import { formatAgo } from '../../lib/formatDuration';
import { useTaskForPlan } from '../tasks/TasksContext';
import { AutopilotStrip } from './AutopilotStrip';
import { Fig20Timeline } from './Fig20Timeline';
import { Fig22FilesByChunk } from './Fig22FilesByChunk';
import { usePlanCommitFiles } from './usePlanCommitFiles';
import { useUncommitted } from './useUncommitted';
import { ChunkRow, DoneRun } from './ChunkRow';
import { BUSY, useBusy, usePlanPane } from './PlanPaneContext';
import { usePlansActions } from './PlansContext';
import { isNoGit, planGit } from './planGit';
import { planTerminalShown, useTabManager } from '../tabs/TabContext';
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
export function onListKey(e) {
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
  const { runSplit, setGitConfig, removePlanRepo, stopAutopilot, dismissAutopilot, updatePlan, shelvePlan } = usePlansActions();
  const { tabs, switchTab } = useTabManager();
  const toast = useToast();
  const reviewingAll = useBusy(BUSY.REVIEW_ALL);
  const settingUpGit = useBusy(BUSY.GIT_SETUP);
  const showingTerminal = planTerminalShown(tabs, plan.tabId);
  const terminalTitle = showingTerminal ? 'Back to this tab\'s terminal' : 'Show the plan\'s terminal in this tab (opens one if closed)';
  const resplit = () => runSplit(repoRoot, plan.id);
  const { done, total } = planProgress(plan);
  const nextId = nextChunkId(plan);
  // Start offered when there is work left and no run to resume.
  const canPilot = plan.split === SPLIT_STATUS.DONE && (!plan.autopilot || plan.autopilot.status === AUTOPILOT_STATUS.DONE || plan.autopilot.status === AUTOPILOT_STATUS.OFF)
    && (!!nextId || plan.chunks.some((c) => c.status === CHUNK_STATUS.IN_PROGRESS));
  const piloted = isAutopilotLive(plan.autopilot);
  // A chunk the agent left without a commit, while nothing is running: it
  // needs you, so the panel leads with it and auto-pilot steps back.
  const stuck = piloted ? null : plan.chunks.find((c) => c.needsCommit) ?? null;
  const uncommitted = useUncommitted(plan, !!stuck, stuck ? `${stuck.id}:${stuck.status}` : null);
  const dirty = uncommitted.files;
  // A chunk sent by hand is adopted by auto-pilot rather than sent again.
  const handSent = piloted ? null : plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS) ?? null;
  // The chunks in flight are always open, as are the ones you open; the next
  // one opens on its own only while nothing is in flight. That's where the work is.
  const inFlight = plan.chunks.filter((c) => c.status === CHUNK_STATUS.IN_PROGRESS || c.awaitingFix);
  const auto = inFlight.length > 0 ? inFlight : plan.chunks.filter((c) => c.id === nextId);
  const [opened, setOpened] = useState(() => new Set());
  const [closed, setClosed] = useState(() => new Set());
  const open = new Set([...auto.filter((c) => !closed.has(closeKey(c))).map((c) => c.id), ...opened]);
  const [showSource, setShowSource] = useState(false);
  const [showRevise, setShowRevise] = useState(false);
  const [reviseNotes, setReviseNotes] = useState('');
  const revising = useBusy(BUSY.REVISE);
  const chunkInFlight = plan.chunks.some((c) => c.status === CHUNK_STATUS.IN_PROGRESS || c.awaitingFix);
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

  // Auto-pilot moving on never scrolls the pane: the run changes chunk while
  // you read (and as it clears context), so only your own actions scroll.

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
  // FIG 22 folds out of the "· K files" count; git runs only once it's open.
  const [showFiles, setShowFiles] = useState(false);
  const filesOpen = showFiles;
  const commitFiles = usePlanCommitFiles(plan, filesOpen);
  const noGit = isNoGit(plan);
  // The plan's terminal key: once git is set up (and not removed), or with no git at all.
  const gitCfg = noGit ? null : planGit(plan);
  const terminalKey = noGit || (!!gitCfg.preparedAt && !gitCfg.removedAt);
  const hasCommits = !noGit && plan.chunks.some((c) => c.status === CHUNK_STATUS.IMPLEMENTED);

  // Read before each chunk, so it can change during a run.
  const freshContext = (
    <label
      className="flex cursor-pointer items-center gap-1.5 text-[11px] text-foreground"
      title={`Auto-pilot clears the agent's context (/clear, or /new in opencode) before each chunk after the first. Later chunks then know earlier ones only from the plan, their decisions and the code.${piloted ? ' A change applies from the next chunk.' : ''}`}
    >
      <Checkbox
        checked={!!plan.clearBetweenChunks}
        onCheckedChange={(v) => updatePlan(repoRoot, plan.id, { clearBetweenChunks: !!v })}
      />
      clear context between chunks
    </label>
  );

  const strip = plan.autopilot && (
    <AutopilotStrip
      plan={plan}
      tabOpen={tabs.some((t) => t.id === plan.autopilot?.tabId)}
      busy={reviewingAll}
      onResume={() => pane.resume(plan)}
      onStop={() => stopAutopilot(repoRoot, plan.id)}
      onDismiss={() => dismissAutopilot(repoRoot, plan.id)}
      onGoToTab={() => switchTab(plan.autopilot.tabId)}
      onReviewAll={noGit ? null : () => pane.reviewAll(plan)}
      options={piloted ? freshContext : null}
    />
  );
  // Running, paused or failed: what the run needs from you comes before the plan's identity.
  const runUp = [AUTOPILOT_STATUS.RUNNING, AUTOPILOT_STATUS.PAUSED, AUTOPILOT_STATUS.FAILED].includes(plan.autopilot?.status);

  // A finished plan is read back chunk by chunk, so its breakdown leads.
  const finished = total > 0 && done === total && !chunkInFlight;
  const chunksBlock = (
    <>
      {total > 0 && (
        <Section
          title="chunks"
          className="pb-0"
          aside={<span className="font-[family-name:var(--font-legend)] text-[11px] tabular-nums text-muted-foreground">
            {plan.chunks.length}
            {hasCommits ? (
              <>
                {' · '}
                <button
                  type="button"
                  aria-expanded={showFiles}
                  aria-controls="plan-files-by-chunk"
                  onClick={() => setShowFiles((v) => !v)}
                  title={showFiles ? 'Hide files by chunk' : 'Show which chunks touched which files'}
                  className="ins-link tabular-nums hover:text-foreground aria-expanded:text-foreground"
                >
                  {fileCount > 0 ? `${fileCount} files` : 'files'}
                </button>
              </>
            ) : (
              fileCount > 0 && ` · ${fileCount} files`
            )}
          </span>}
        >
          {filesOpen && (
            <div id="plan-files-by-chunk" className="pb-1">
              <Fig22FilesByChunk plan={plan} files={commitFiles} />
            </div>
          )}
        </Section>
      )}

      <div className="group/list flex flex-col py-1.5" onKeyDown={onListKey}>
        {(() => {
          // An unfolded run keeps its row, as the key that folds it again.
          const rows = chunkSegments(plan.chunks, open).flatMap((seg) => {
            if (!seg.run) return [{ key: seg.key, chunk: seg.chunk }];
            // A finished plan opens unfolded; the set then holds the runs you flipped.
            const head = { key: seg.key, run: seg.run, unfolded: unfolded.has(seg.key) !== finished };
            return head.unfolded ? [head, ...seg.run.map((chunk) => ({ key: chunk.id, chunk }))] : [head];
          });
          // P6: the "took" lines of the rows on show share one scale, with its
          // ruler over the right-hand column.
          const spans = rows
            .filter((row) => row.chunk?.status === CHUNK_STATUS.IMPLEMENTED && row.chunk.startedAt && row.chunk.doneAt)
            .map(({ chunk }) => ({ startedAt: chunk.startedAt, endedAt: chunk.doneAt }));
          return (
            <SpanScale items={spans}>
              <SpanRuler className="flex justify-end px-3 pb-0.5" />
              {rows.map((row) => {
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
                    uncommitted={row.chunk.id === stuck?.id ? uncommitted : null}
                  />
                );
              })}
            </SpanScale>
          );
        })()}
        {/* Keys for the list, only while it has focus. */}
        {total > 0 && (
          <div className="hidden flex-wrap items-center gap-x-1 gap-y-1 px-3 pt-2 text-[11px] text-muted-foreground group-focus-within/list:flex">
            <FrameHints hints={LIST_HINTS} />
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-col px-3 pt-2 pb-3.5">
        <div className="flex items-center gap-1.5">
          <PanelButton icon={NavArrowLeft} onClick={pane.closePlan} title="Back to all plans">plans</PanelButton>
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
            <PanelButton
              aria-pressed={showRevise}
              data-latched={showRevise || undefined}
              aria-controls="plan-revise"
              onClick={() => setShowRevise((v) => !v)}
              title="Ask the agent in this tab to change the plan file"
            >
              revise
            </PanelButton>
            <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-[var(--ins-edge)]" />
            {plan.split !== SPLIT_STATUS.RUNNING && (
              <PanelButton
                onClick={() => pane.rechunk(plan)}
                disabled={revising || chunkInFlight || piloted}
                title={chunkInFlight || piloted ? 'Not while a chunk or auto-pilot is running'
                  : started ? 'Split what isn\'t done yet again, from the plan file as it is now; finished chunks stay'
                    : 'Split the plan again, from its file as it is now'}
              >
                {started ? 're-chunk' : 're-split'}
              </PanelButton>
            )}
            <PanelButton
              onClick={() => shelvePlan(repoRoot, plan.id, !plan.shelved)}
              title={plan.shelved ? 'Show this plan on its tab and in the tabs pane again' : 'Take this plan out of the tabs pane; it stays here'}
            >
              {plan.shelved ? 'unshelve' : 'shelve'}
            </PanelButton>
            {/* Destructive goes last, set apart, and prints its fault on hover. */}
            <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-[var(--ins-edge)]" />
            <PanelButton onClick={() => pane.deletePlan(plan)} className="hover:text-[var(--ins-fault)]" title="Delete this plan (asks first)">delete</PanelButton>
          </span>
        </div>
        {showSource && (
          <pre id="plan-source" className="ins-well mt-2 max-h-72 overflow-auto whitespace-pre-wrap wrap-anywhere px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {plan.source}
          </pre>
        )}

        {showRevise && (
          <form
            id="plan-revise"
            className="mt-2 flex flex-col gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reviseNotes.trim()) return;
              if (await pane.revise(plan, reviseNotes)) {
                setReviseNotes('');
                setShowRevise(false);
              }
            }}
          >
            <textarea
              aria-label="What should change in the plan"
              value={reviseNotes}
              onChange={(e) => setReviseNotes(e.target.value)}
              rows={4}
              placeholder="what should change in the plan? the agent edits only the plan file"
              className="ins-well resize-y px-1.5 py-1 text-[11px] leading-relaxed text-foreground outline-none"
              autoFocus
            />
            <div className="flex gap-1.5">
              <PanelButton type="submit" variant="default" disabled={!reviseNotes.trim() || revising}>send to agent</PanelButton>
              <PanelButton variant="outline" onClick={() => setShowRevise(false)}>cancel</PanelButton>
            </div>
          </form>
        )}

        {runUp && <div className="mt-3">{strip}</div>}

        {/* Identity next: the title, and what the plan is for. */}
        {/* The plan's name is a proper name: Spectral italic, the pane's largest type. */}
        <h3 className="ins-name mt-3.5 text-[17px] leading-tight text-foreground wrap-anywhere">{plan.title || UNTITLED_PLAN}</h3>
        {plan.summary && <Prose text={plan.summary} clamp={3} className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground" />}

        <LifecycleLine plan={plan} />

        {/* What needs you, in one line: live state is a box (DESIGN.md rule 10). */}
        {stuck && (
          <button
            type="button"
            onClick={() => openChunk(stuck.id, { focus: true })}
            title={`Go to chunk ${stuck.n}`}
            className="ins-well mt-3 flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-[11px] outline-none hover:text-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
          >
            <Lamp state="wait" label="needs you" />
            <span className="engraved-label shrink-0">needs you</span>
            <span className="min-w-0 truncate tabular-nums text-foreground" role="status">
              chunk {stuck.n} · no commit
              <span className="text-muted-foreground">
                {dirty == null ? '' : dirty.length > 0
                  ? ` · ${dirty.length} uncommitted → commit`
                  : ' · tree clean → mark done'}
              </span>
            </span>
          </button>
        )}
      </div>

      {finished && chunksBlock}

      {/* Sections: each hangs from a ruled head (calibrated's section line), so
          progress, run, git and chunks read as separate concerns. */}
      {total > 0 && (
        <Section title="progress">
          {/* The timeline once a chunk has a time; until then the bar. A live
              run's strip already says where it is: no second count. */}
          <Fig20Timeline plan={plan} showCount={!runUp} fallback={<ProgressReadout plan={plan} done={done} total={total} />} />
        </Section>
      )}

      {/* How the plan gets done: auto-pilot, and the plan's own terminal. */}
      {((plan.autopilot && !runUp) || canPilot || terminalKey) && (
        <Section
          title="run"
          aside={terminalKey && (
            <PanelButton icon={Terminal} onClick={() => pane.openPlanTab(plan)} aria-pressed={showingTerminal} title={terminalTitle}>
              {showingTerminal ? 'back' : 'terminal'}
            </PanelButton>
          )}
        >
          {/* A settled run (done or off) is a line here; a live one sits at the top. */}
          {plan.autopilot && !runUp && strip}
          {/* The run bank: the primary key, with its one option beside it.
              During a run the option moves into the strip, beside stop. While
              a chunk is stuck its fix is the primary key, so this one steps
              down to an outline key. */}
          {canPilot && (
            <div className="flex items-center gap-3">
              <PanelButton
                icon={Play}
                onClick={() => pane.autopilot(plan)}
                variant={stuck ? 'outline' : 'default'}
                title={handSent
                  ? `Adopt chunk ${handSent.n} (asking the agent to commit it if needed), then implement the rest one after another, unattended`
                  : 'Implement the remaining chunks one after another, unattended'}
              >
                {handSent ? `run on auto-pilot from ${handSent.n}` : 'run on auto-pilot'}
              </PanelButton>
              {freshContext}
            </div>
          )}
        </Section>
      )}

      {/* Setup: one line; the form opens on demand. */}
      <Section title="git">
        {noGit ? (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">no git · chunks finish on PLAN-STATUS</span>
        ) : (
        <PlanGitSection
          plan={plan}
          busy={settingUpGit}
          onChange={(patch) => setGitConfig(repoRoot, plan.id, patch)}
          onAddRepo={(path) => pane.addRepo(plan, path)}
          onRemoveRepo={(root) => removePlanRepo(repoRoot, plan.id, root)}
          onRemoveWorktrees={() => pane.removeWorktrees(plan)}
          onReopen={started || isAutopilotLive(plan.autopilot) ? null : () => pane.reopenGit(plan)}
        />
        )}
      </Section>

      {plan.split === SPLIT_STATUS.RUNNING && (
        <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-muted-foreground">
          <Scanner size="md" />
          splitting into chunks…
        </div>
      )}
      {plan.split === SPLIT_STATUS.FAILED && (
        <div className="flex flex-col items-start gap-1.5 px-3 py-2.5 text-[11px]">
          <span className="flex items-center gap-2 text-foreground"><Lamp state="fault" /> split failed</span>
          <span className="break-words text-[11px] leading-relaxed text-muted-foreground">{plan.splitError}</span>
          <PanelButton icon={Refresh} onClick={resplit}>re-split</PanelButton>
        </div>
      )}

      {!finished && chunksBlock}
    </div>
  );
}

/** idea 3 Nov ─2d→ planned 5 Nov ─1h→ building …: each stage reached, with the time it took to get there. */
function LifecycleLine({ plan }) {
  const stops = planLifecycle(plan, useTaskForPlan(plan.id));
  const openPr = () => import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(plan.pr.url));
  return (
    <p aria-label="Plan lifecycle" className="mt-2 flex flex-wrap items-baseline gap-x-1 text-[11px] tabular-nums text-muted-foreground">
      {stops.map((s, i) => (
        <span key={s.stage} className="whitespace-nowrap">
          {i > 0 && <span>─{formatAgo(s.at - stops[i - 1].at)}→ </span>}
          {s.stage === PLAN_STAGE.PR_OPEN && plan.pr?.url ? (
            <button type="button" onClick={openPr} className="ins-link text-foreground" title={plan.pr.url}>
              PR #{plan.pr.number}
            </button>
          ) : (
            <span className={i === stops.length - 1 ? 'text-foreground' : undefined}>{s.stage}</span>
          )}{' '}
          {shortDate(s.at)}
        </span>
      ))}
      {plan.revisions?.length > 0 && (
        <span className="whitespace-nowrap" title={plan.revisions.map((r) => shortDate(r.at)).join(', ')}>
          · revised {plan.revisions.length}×
        </span>
      )}
    </p>
  );
}
