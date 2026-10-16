import { useState, useEffect, useLayoutEffect, useRef, useMemo, memo, Fragment, Suspense } from 'react';
import { Square, GitCompare, Check, Trash2, FileText, GitMerge, RotateCcw, ChevronRight, ChevronDown, AlertTriangle, Copy, Archive, ArchiveRestore, Trophy, Plus } from 'lucide-react';
import { PanelButton } from '../../components/instrument/PanelButton';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { Checkbox } from '../../components/ui/checkbox';
import { SubagentList } from '../../components/AgentSidebar';
import { useSubagentContext } from '../../contexts/SubagentContext';
import { useToast } from '../toast';
import { Lamp, jobLamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { PaneLegend } from '../../components/instrument/PaneLegend';
import { Keycap, KeyChord } from '../../components/instrument/Keycap';
import { DiffBar } from '../../components/instrument/DiffBar';
import { JOBS_PANE_EVENT } from './jobsPane';
import { useAgentJobs } from './AgentJobsContext';
import { lazyNamed } from '../../lib/lazyNamed';
import { useTabManager } from '../tabs/TabContext';
import { TabsSummaryPane } from '../tabs/TabsSummaryPane';

// Loaded on first open, mounted only while open.
const GitDiffDialog = lazyNamed(() => import('../git/GitDiffDialog'), 'GitDiffDialog');
const MarkdownViewerDialog = lazyNamed(() => import('../markdown/MarkdownViewerDialog'), 'MarkdownViewerDialog');
const RunJobDialog = lazyNamed(() => import('./RunJobDialog'), 'RunJobDialog');
const RaceCompareDialog = lazyNamed(() => import('./RaceCompareDialog'), 'RaceCompareDialog');

const MIN_WIDTH = 224;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 256;
const WIDTH_KEY = 'agentJobsSidebarWidth';

// Compact human duration between two epoch-ms timestamps (endedAt || now).
function formatDuration(startedAt, endedAt) {
  if (!startedAt) return null;
  const secs = Math.max(0, Math.floor(((endedAt || Date.now()) - startedAt) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

const STATUS_META = {
  running: { color: 'var(--color-status-success)', label: 'running' },
  done: { color: 'var(--color-status-success)', label: 'done' },
  applied: { color: 'var(--ins-ok)', label: 'applied' },
  conflict: { color: 'var(--color-status-warning)', label: 'conflict' },
  failed: { color: 'var(--color-destructive)', label: 'failed' },
  cancelled: { color: 'var(--color-muted-foreground)', label: 'cancelled' },
  interrupted: { color: 'var(--color-status-warning)', label: 'interrupted' },
};

// A job can be reconciled into the current branch once it has finished with
// isolated changes still sitting in its worktree.
function isReconcilable(job) {
  return (
    (job.status === 'done' ||
      job.status === 'failed' ||
      job.status === 'conflict' ||
      job.status === 'interrupted') &&
    !!job.worktreePath &&
    job.changedFiles.length > 0
  );
}

// Fold race candidates into a single entry so they render as one comparison
// group, in the position of the race's first (newest) candidate.
function groupJobs(list) {
  const out = [];
  const seen = new Set();
  for (const job of list) {
    if (!job.raceId) {
      out.push({ type: 'job', key: job.id, job });
      continue;
    }
    if (seen.has(job.raceId)) continue;
    seen.add(job.raceId);
    out.push({ type: 'race', key: job.raceId, jobs: list.filter((j) => j.raceId === job.raceId) });
  }
  return out;
}

export function RightSidebar({ projectPath }) {
  const {
    jobs,
    cancelJob,
    approveJob,
    rerunJob,
    reconcileJobs,
    discardJob,
    archiveJob,
    unarchiveJob,
    pickRaceWinner,
    reviseJob,
  } = useAgentJobs();
  const { totalActiveCount } = useSubagentContext();
  const { tabs: openTabs } = useTabManager();
  const toast = useToast();

  // null = automatic: the pane folds away while there is nothing to show.
  // An explicit true/false is the user's choice and wins until a new job starts.
  const [collapsedOverride, setCollapsedOverride] = useState(null);
  const [tab, setTab] = useState('tabs');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [review, setReview] = useState(null); // { jobId, filePath }
  // Review notes pinned to lines of the job being reviewed, sent back to the
  // agent as a revision instead of being retyped as a fresh prompt.
  const [notes, setNotes] = useState([]);
  const [sendingNotes, setSendingNotes] = useState(false);
  const [reportPath, setReportPath] = useState(null); // markdown report being viewed
  const [compareRaceId, setCompareRaceId] = useState(null); // race being compared A-vs-B
  const [selected, setSelected] = useState(() => new Set()); // job ids picked for reconcile
  const [reconciling, setReconciling] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Archived jobs are stored alongside the rest but kept out of immediate sight.
  const visibleJobs = jobs.filter((j) => !j.archived);
  const archivedJobs = jobs.filter((j) => j.archived);
  // With several tabs open the tabs summary always has something to show.
  const isEmpty = visibleJobs.length === 0 && totalActiveCount === 0 && openTabs.length < 2;
  const collapsed = collapsedOverride ?? isEmpty;

  useEffect(() => {
    const onRequest = (e) => {
      if (e.detail?.action === 'toggle') setCollapsedOverride(!collapsed);
      else setCollapsedOverride(false);
    };
    window.addEventListener(JOBS_PANE_EVENT, onRequest);
    return () => window.removeEventListener(JOBS_PANE_EVENT, onRequest);
  }, [collapsed]);

  // User-resizable panel width — persisted so it survives reloads. A narrow
  // fixed panel is what made the cards feel squashed.
  const [width, setWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(WIDTH_KEY), 10);
    return Number.isFinite(saved) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, saved)) : DEFAULT_WIDTH;
  });
  const paneRef = useRef(null);

  // A drag writes the width straight onto the pane once per frame; state and
  // storage are committed on mouseup so the pane doesn't re-render per move.
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    let frame = 0;
    let pending = null;
    const apply = () => {
      frame = 0;
      if (paneRef.current) paneRef.current.style.width = `${pending}px`;
    };
    const onMove = (ev) => {
      // Panel is anchored right, so dragging left (smaller clientX) widens it.
      pending = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onUp = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (pending == null) return;
      apply();
      setWidth(pending);
      localStorage.setItem(WIDTH_KEY, String(pending));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const runningJobs = jobs.filter((j) => j.status === 'running').length;

  // Keep the selection in sync with the jobs that are still reconcilable
  // (finished/discarded jobs drop out on their own).
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(jobs.filter((j) => isReconcilable(j) && !j.archived).map((j) => j.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [jobs]);

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleReconcile = async () => {
    if (selected.size === 0 || reconciling) return;
    setReconciling(true);
    const count = selected.size;
    try {
      const res = await reconcileJobs([...selected]);
      if (res?.started) {
        const collisions = (res.overlapCount || 0) + (res.seededConflicts || 0);
        if (collisions > 0) {
          const bits = [];
          if (res.overlapCount) bits.push(`${res.overlapCount} file${res.overlapCount === 1 ? '' : 's'} edited by 2+ jobs`);
          if (res.seededConflicts) bits.push(`${res.seededConflicts} job${res.seededConflicts === 1 ? '' : 's'} conflicted on apply`);
          toast.warning(
            `Reconciling ${count} jobs — ${bits.join(', ')}. An agent is resolving them; review carefully before applying.`
          );
        } else {
          toast.info(
            `Reconciling ${count} job${count === 1 ? '' : 's'} — no file overlaps; an agent is verifying the combined result`
          );
        }
      } else if (res?.error) {
        toast.error(`Reconcile failed: ${res.error}`);
      }
    } finally {
      setReconciling(false);
      setSelected(new Set());
    }
  };

  const handleApprove = async (id, force = false) => {
    const count = jobs.find((j) => j.id === id)?.changedFiles.length ?? 0;
    const result = await approveJob(id, { force });
    if (result?.blocked) {
      const n = result.typecheck?.errorCount ?? 0;
      toast.error(
        `Not applied — ${n} type error${n === 1 ? '' : 's'} in the changes. Fix them in the worktree, or use "Apply anyway".`
      );
    } else if (result?.ok) {
      const files = `${count} file${count === 1 ? '' : 's'}`;
      const suffix = result.forced ? ' (typecheck skipped)' : '';
      // Looked up on demand: the toast is the only consumer, so a poll for
      // it would cost 2 Hz of git calls for one string.
      const branchName = projectPath
        ? await invoke('get_current_branch', { repoPath: projectPath }).catch(() => null)
        : null;
      toast.success(
        `Applied ${files} into your ${branchName ? `${branchName} ` : ''}working tree — uncommitted${suffix}`
      );
    } else if (result?.error) {
      toast.error(`Apply failed: ${result.error}`);
    }
  };

  // Settle a race: apply this candidate, throw the others away.
  const handlePickWinner = async (id, force = false) => {
    const job = jobs.find((j) => j.id === id);
    const count = job?.changedFiles.length ?? 0;
    const result = await pickRaceWinner(id, { force });
    if (result?.blocked) {
      const n = result.typecheck?.errorCount ?? 0;
      toast.error(
        `Not applied — ${n} type error${n === 1 ? '' : 's'} in this candidate. Pick another, or use "Keep anyway".`
      );
    } else if (result?.ok) {
      const others = result.discarded || 0;
      toast.success(
        `Kept ${job?.cli || 'candidate'} — ${count} file${count === 1 ? '' : 's'} applied, ${others} other candidate${
          others === 1 ? '' : 's'
        } discarded`
      );
    } else if (result?.error) {
      toast.error(`Apply failed: ${result.error}`);
    }
  };

  const openReview = (id) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    setNotes([]);
    setReview({ jobId: job.id, filePath: job.changedFiles[0]?.path || null });
  };

  const addNote = (note) =>
    setNotes((prev) => [...prev, { ...note, id: `${Date.now()}-${prev.length}` }]);

  const removeNote = (id) => setNotes((prev) => prev.filter((n) => n.id !== id));

  // Ship the notes back to the agent that wrote the diff — it re-runs in the
  // same worktree with the original task plus the feedback.
  const handleSendNotes = async () => {
    if (!review || notes.length === 0 || sendingNotes) return;
    setSendingNotes(true);
    try {
      const result = await reviseJob(review.jobId, notes);
      if (result?.ok) {
        toast.info(`Sent ${notes.length} note${notes.length === 1 ? '' : 's'} back to the agent`);
        setNotes([]);
        setReview(null);
      } else {
        toast.error(`Could not send notes: ${result?.error || 'unknown error'}`);
      }
    } finally {
      setSendingNotes(false);
    }
  };

  const handleRerun = async (id) => {
    await rerunJob(id);
    toast.info('Re-running job');
  };

  // Copy just the LLM output — no prompt, no metadata — so it can be pasted as a
  // prompt elsewhere. Prefer the full on-disk log; fall back to the in-memory
  // buffer (capped, so long jobs may be truncated).
  const handleCopyOutput = async (id) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    try {
      let output = job.output.map((o) => o.chunk).join('\n');
      if (job.logPath) {
        try {
          const full = await invoke('read_file_content', { path: job.logPath });
          if (full.trim()) output = full.replace(/\n$/, '');
        } catch {
          // Log file missing — fall back to the in-memory buffer above.
        }
      }
      if (!output.trim()) {
        toast.info('No output to copy');
        return;
      }
      await navigator.clipboard.writeText(output);
      toast.success('Copied output to clipboard');
    } catch (err) {
      toast.error(`Copy failed: ${err}`);
    }
  };

  // Auto-expand + jump to Jobs when a new job is launched.
  const prevCount = useRef(jobs.length);
  useEffect(() => {
    if (jobs.length > prevCount.current) {
      setCollapsedOverride(null);
      setTab('jobs');
    }
    prevCount.current = jobs.length;
  }, [jobs.length]);

  const reviewJob = review ? jobs.find((j) => j.id === review.jobId) : null;
  const compareJobs = compareRaceId ? jobs.filter((j) => j.raceId === compareRaceId) : [];

  // Card actions take a job id and keep their identity across renders, so
  // memo(JobCard) re-renders only the card whose job changed. They forward to
  // the latest handlers, which close over `jobs` (new on every output batch).
  const handlersRef = useRef(null);
  useLayoutEffect(() => {
    handlersRef.current = {
      toggleSelect,
      cancel: cancelJob,
      approve: handleApprove,
      pickWinner: handlePickWinner,
      rerun: handleRerun,
      discard: discardJob,
      archive: archiveJob,
      unarchive: unarchiveJob,
      review: openReview,
      report: (id) => setReportPath(jobs.find((j) => j.id === id)?.reportPath ?? null),
      copyOutput: handleCopyOutput,
    };
  });
  const cardActions = useMemo(() => {
    const forward = (name) => (...args) => handlersRef.current[name](...args);
    return Object.fromEntries(
      ['toggleSelect', 'cancel', 'approve', 'pickWinner', 'rerun', 'discard', 'archive', 'unarchive', 'review', 'report', 'copyOutput']
        .map((name) => [name, forward(name)])
    );
  }, []);

  // One place that knows how a job card is wired, shared by the active list, the
  // race groups and the archived section.
  const renderCard = (job, { archived = false } = {}) => (
    <JobCard
      key={job.id}
      job={job}
      archived={archived}
      selectable={!archived && isReconcilable(job)}
      selected={selected.has(job.id)}
      selectionActive={selected.size > 0}
      actions={cardActions}
    />
  );

  if (collapsed) {
    // One lamp per job reads the whole queue at a glance; the pane index sits
    // on a keycap instead of a rotated label.
    const railJobs = visibleJobs.slice(0, 8);
    return (
      <div data-pane="4" className="flex flex-col items-center gap-2 py-2 my-1.5 mr-2 ml-1.5 shrink-0 w-7 edge-engraved bg-[var(--ins-panel)]">
        <button
          onClick={() => setCollapsedOverride(false)}
          className="flex flex-col items-center gap-2 px-0.5 py-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Expand pane (Alt+4)"
          aria-label="Expand pane"
        >
          <span className="text-[11px]" aria-hidden="true">«</span>
          <Keycap size="sm">4</Keycap>
        </button>
        {railJobs.length > 0 && (
          <div className="flex flex-col items-center gap-2 pt-0.5">
            {railJobs.map((j) => (
              <Lamp key={j.id} {...jobLamp(j.status)} label={`${j.label}: ${j.status}`} />
            ))}
            {visibleJobs.length > railJobs.length && (
              <span className="text-[10px] tabular-nums text-muted-foreground">+{visibleJobs.length - railJobs.length}</span>
            )}
          </div>
        )}
        {totalActiveCount > 0 && (
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground" title="Active agents">
            {totalActiveCount}
          </span>
        )}
        <button
          onClick={() => {
            setCollapsedOverride(false);
            setTab('jobs');
            setDialogOpen(true);
          }}
          className="mt-auto text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
          title="New background job"
          aria-label="New background job"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div
      ref={paneRef}
      style={{ width }}
      onKeyDown={(e) => {
        // N opens a new job while focus is in the pane (not in a text field).
        if (tab !== 'jobs' || e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return;
        e.preventDefault();
        setDialogOpen(true);
      }}
      tabIndex={-1}
      data-pane="4"
      data-title={`[4] ${tab}`}
      data-legend
      className="tui-pane flex flex-col shrink-0 overflow-hidden my-1.5 mr-2 ml-1.5 text-sidebar-foreground outline-none"
    >
      <PaneLegend
        index={4}
        title={tab === 'tabs' ? 'Tabs' : tab === 'jobs' ? 'Jobs' : 'Agents'}
        status={
          tab === 'tabs' ? `${openTabs.length} open`
            : tab === 'jobs' ? (runningJobs > 0 ? `${runningJobs} running` : undefined)
            : (totalActiveCount > 0 ? `${totalActiveCount} active` : undefined)
        }
        lamp={tab !== 'tabs' && (tab === 'jobs' ? runningJobs : totalActiveCount) > 0 ? 'on' : undefined}
        trailing={
          <>
            <KeyChord keys={['alt', '4']} size="sm" />
            <button
              onClick={() => setCollapsedOverride(true)}
              className="text-[11px] leading-none text-muted-foreground hover:text-foreground cursor-pointer"
              title="Collapse pane"
              aria-label="Collapse pane"
            >
              »
            </button>
          </>
        }
      />
      {/* Drag-to-resize handle sitting over the left edge. */}
      <div
        onMouseDown={startResize}
        className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize hover:bg-[var(--ins-edge-strong)] active:bg-[var(--ins-lamp)] transition-colors"
        title="Drag to resize"
      />

      {/* Tabs / jobs / agents switch; agents only while there are subagents. */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 shrink-0 edge-b-engraved">
        <TabButton active={tab === 'tabs'} onClick={() => setTab('tabs')} label="tabs" count={openTabs.length} />
        <TabButton active={tab === 'jobs'} onClick={() => setTab('jobs')} label="jobs" count={runningJobs} />
        {(totalActiveCount > 0 || tab === 'agents') && (
          <TabButton active={tab === 'agents'} onClick={() => setTab('agents')} label="agents" count={totalActiveCount} />
        )}
      </div>

      {tab === 'jobs' && selected.size > 0 && (
        <div className="flex flex-col gap-1.5 px-3 py-2 shrink-0 border-b border-b-sidebar-border bg-sidebar-accent/40">
          <div className="flex items-center gap-2">
            <button
              onClick={handleReconcile}
              disabled={reconciling}
              className="flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-[var(--ins-lamp)] shadow-[inset_0_0_0_1px_var(--ins-lamp)] hover:bg-[var(--ins-lamp)] hover:text-[var(--ins-panel)] disabled:opacity-60 cursor-pointer"
              title="Merge the selected jobs with an agent that resolves conflicts and verifies the combined result"
            >
              {reconciling ? <Scanner /> : <GitMerge className="h-3 w-3" />}
              Reconcile {selected.size}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={reconciling}
              className="text-[11px] text-muted-foreground hover:text-sidebar-foreground cursor-pointer disabled:opacity-60"
            >
              Clear
            </button>
          </div>
          <span className="text-[11px] leading-snug text-muted-foreground/70">
            An agent merges them in an isolated worktree and verifies the build. Review before applying.
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 pb-1.5 flex flex-col">
        {tab === 'tabs' ? (
          <TabsSummaryPane />
        ) : tab === 'agents' ? (
          <SubagentList />
        ) : (
          <>
            {visibleJobs.length === 0 ? (
              <div className="flex flex-col gap-1 px-3 py-2 text-[11px]">
                <div className="text-foreground">
                  <span className="text-muted-foreground">-- </span>
                  {archivedJobs.length > 0 ? 'no active jobs' : 'no background jobs'}
                  <span className="text-muted-foreground"> --</span>
                </div>
                <div className="text-[11px] leading-relaxed text-muted-foreground">
                  # dispatch a headless agent run with [+ new job]
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {groupJobs(visibleJobs).map((entry) =>
                  entry.type === 'race' ? (
                    <RaceGroup
                      key={entry.key}
                      jobs={entry.jobs}
                      renderCard={renderCard}
                      onCompare={() => setCompareRaceId(entry.key)}
                    />
                  ) : (
                    renderCard(entry.job)
                  )
                )}
              </div>
            )}

            <button
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] text-muted-foreground hover:text-sidebar-foreground cursor-pointer transition-colors"
            >
              <Plus className="h-3 w-3" />
              new job
              <Keycap size="sm" className="ml-auto">N</Keycap>
            </button>

            {/* Archived jobs: stored but out of immediate sight, browsable on demand. */}
            {archivedJobs.length > 0 && (
              <div className="mt-2 border-t border-t-sidebar-border/60 pt-1">
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/70 hover:text-sidebar-foreground cursor-pointer transition-colors"
                >
                  {showArchived ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Archive className="h-3 w-3" />
                  Archived
                  <span className="tabular-nums">{archivedJobs.length}</span>
                </button>
                {showArchived && (
                  <div className="flex flex-col gap-1.5 px-2 pt-0.5 opacity-80">
                    {archivedJobs.map((job) => renderCard(job, { archived: true }))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <Suspense fallback={null}>
      {dialogOpen && <RunJobDialog open={dialogOpen} onOpenChange={setDialogOpen} projectPath={projectPath} />}

      {reviewJob && review.filePath && (
        <div className="fixed inset-0 z-50">
          <GitDiffDialog
            open
            onOpenChange={(o) => !o && setReview(null)}
            filePath={review.filePath}
            repoPath={reviewJob.cwd}
            changedFiles={reviewJob.changedFiles}
            onFileChange={(filePath) => setReview((r) => ({ ...r, filePath }))}
            annotations={notes}
            onAddAnnotation={reviewJob.status === 'running' ? undefined : addNote}
            onRemoveAnnotation={removeNote}
            onSendAnnotations={handleSendNotes}
            sendingAnnotations={sendingNotes}
          />
        </div>
      )}

      {compareJobs.length > 1 && (
        <div className="fixed inset-0 z-50">
          <RaceCompareDialog jobs={compareJobs} onClose={() => setCompareRaceId(null)} />
        </div>
      )}

      {reportPath && (
        <div className="fixed inset-0 z-50">
          <MarkdownViewerDialog
            open
            onOpenChange={(o) => !o && setReportPath(null)}
            filePath={reportPath}
            repoPath={projectPath}
          />
        </div>
      )}
      </Suspense>
    </div>
  );
}

// Candidates of one race, boxed together so they read as alternatives to choose
// between rather than as unrelated jobs that all want applying.
function RaceGroup({ jobs, renderCard, onCompare }) {
  const running = jobs.filter((j) => j.status === 'running').length;
  const settled = jobs.some((j) => j.status === 'applied');
  // Comparing needs two candidates that actually produced changes.
  const comparable = jobs.filter((j) => j.status !== 'running' && j.changedFiles.length > 0).length;
  return (
    // A bracket frame with its legend inset into the top line, like a group
    // of controls on a panel.
    <div className="relative mt-1.5 shadow-[inset_0_0_0_1px_var(--ins-edge-strong)]">
      <div className="absolute -top-[6px] left-2 right-2 flex items-center justify-between text-[11px] leading-none">
        <span className="flex items-center gap-1.5 bg-[var(--ins-panel)] px-1.5 min-w-0">
          <span className="ins-legend shrink-0">Race</span>
          <span className="truncate text-muted-foreground" title={jobs[0]?.label}>{jobs[0]?.label}</span>
        </span>
        <span className="flex items-center gap-1.5 bg-[var(--ins-panel)] px-1.5 shrink-0 tabular-nums text-muted-foreground">
          {running > 0 ? (
            <>
              <Lamp state="on" blink />
              {running}/{jobs.length}
            </>
          ) : (
            <span>{jobs.length} candidate{jobs.length === 1 ? '' : 's'}</span>
          )}
        </span>
      </div>
      {running === 0 && comparable > 1 && (
        <div className="flex justify-end px-2 pt-2 text-[11px]">
          <PanelButton icon={GitCompare} onClick={onCompare} title="Diff two candidates against each other">
            compare
          </PanelButton>
        </div>
      )}
      {!settled && (
        <div className="px-2 pt-2.5 pb-1 text-[11px] leading-snug text-muted-foreground/70">
          Same prompt, separate worktrees. Keeping one applies it and discards the rest.
        </div>
      )}
      <div className="flex flex-col p-1.5 pt-0.5">{jobs.map((job) => renderCard(job))}</div>
    </div>
  );
}

function TabButton({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'ins-legend flex items-center gap-1 px-1.5 py-0.5 cursor-pointer border-b-2',
        active ? 'text-[var(--ins-lamp)] border-[var(--ins-lamp)]' : 'text-muted-foreground border-transparent hover:text-foreground'
      )}
    >
      {label}
      {count > 0 && <span className="tabular-nums text-foreground">{count}</span>}
    </button>
  );
}

// Live elapsed time for a running job. Owns its ticker so only this text
// re-renders each second, not the pane or the card.
function Elapsed({ startedAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return formatDuration(startedAt, now);
}

// Consecutive lines from the same stream joined into one string, so the log
// renders as a few text runs instead of one keyed element per line.
function outputRuns(output) {
  const runs = [];
  output.forEach((l, i) => {
    const text = (l.chunk || ' ') + (i < output.length - 1 ? '\n' : '');
    const stderr = l.stream === 'stderr';
    const last = runs[runs.length - 1];
    if (last && last.stderr === stderr) last.text += text;
    else runs.push({ stderr, text });
  });
  return runs;
}

const JobCard = memo(function JobCard({ job, archived, selectable, selected, selectionActive, actions }) {
  const [expanded, setExpanded] = useState(false);
  const logRef = useRef(null);
  const meta = STATUS_META[job.status] || STATUS_META.done;
  const lamp = jobLamp(job.status);
  const changedCount = job.changedFiles.length;
  const isRunning = job.status === 'running';
  const isDone =
    job.status === 'done' ||
    job.status === 'failed' ||
    job.status === 'conflict' ||
    job.status === 'interrupted';
  const duration = isRunning ? null : formatDuration(job.startedAt, job.endedAt);
  // A race candidate is applied by winning, which also clears the others.
  const isRace = !!job.raceId;
  const stat = job.diffStat;
  const hasStat = stat && (stat.added > 0 || stat.removed > 0);
  // A status word for anything that isn't a clean running/done state.
  const showStatusChip = !isRunning && job.status !== 'done';
  const canApprove = isDone && !!job.worktreePath && changedCount > 0;
  // Checkboxes replace lamps only while a reconcile selection is being built.
  const showCheckbox = selectable && (selected || selectionActive);
  const tc = job.typecheck;
  const tcChecking = tc?.status === 'checking';
  const tcErrors = tc?.status === 'done' && tc.errorCount > 0;
  const tcClean = tc?.status === 'done' && tc.errorCount === 0;

  // Keep the expanded log pinned to the newest output while a job streams. Keyed
  // on the array, not its length: once the buffer caps the length stops changing.
  useEffect(() => {
    if (expanded && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [expanded, job.output]);

  return (
    // One row per job, split by hairlines: lamp, title and time on the first
    // line, agent and diff on the second. Output and actions open on demand.
    <div
      className={cn(
        'edge-b-engraved transition-colors',
        selected || expanded ? 'bg-[color-mix(in_srgb,var(--ins-lamp)_6%,transparent)]' : 'hover:bg-[color-mix(in_srgb,var(--ins-lamp)_4%,transparent)]'
      )}
    >
      <div className="flex items-center gap-2 px-2.5 pt-2">
        {showCheckbox ? (
          <Checkbox
            checked={selected}
            onCheckedChange={() => actions.toggleSelect(job.id)}
            aria-label={`Select ${job.label} for reconcile`}
            className="h-3 w-3 shrink-0"
          />
        ) : (
          <Lamp {...lamp} label={meta.label} />
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-w-0 flex-1 truncate text-left text-xs cursor-pointer hover:text-foreground"
          title={expanded ? 'Hide output and actions' : `${job.label} — show output and actions`}
        >
          {job.label}
        </button>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {isRunning ? <Elapsed startedAt={job.startedAt} /> : duration}
        </span>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 pr-2.5 pb-2 text-[11px]">
        <span className="text-muted-foreground">{job.cli}</span>
        {job.kind === 'reconcile' && (
          <span className="inline-flex items-center gap-0.5 text-[var(--ins-lamp)]">
            <GitMerge className="h-2.5 w-2.5" />
            merge
          </span>
        )}
        {hasStat && (
          <span className="inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap">
            <DiffBar added={stat.added} removed={stat.removed} />
            <span style={{ color: 'var(--ins-ok)' }}>+{stat.added}</span>
            <span style={{ color: 'var(--ins-fault)' }}>−{stat.removed}</span>
          </span>
        )}
        {showStatusChip && <span style={{ color: meta.color }}>{meta.label}</span>}
        {tcChecking && (
          <span className="inline-flex items-center gap-0.5 text-muted-foreground/70">
            <Scanner />
            typecheck
          </span>
        )}
        {tcErrors && (
          <span
            className="inline-flex items-center gap-0.5"
            style={{ color: 'var(--color-destructive)' }}
            title={tc.failed.map((f) => `${f.path.split('/').pop()}: ${f.errorCount}`).join('\n')}
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            {tc.errorCount} type error{tc.errorCount === 1 ? '' : 's'}
          </span>
        )}
        {tcClean && (
          <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--color-status-success)' }}>
            <Check className="h-2.5 w-2.5" />
            types ok
          </span>
        )}
      </div>

      {/* Loud conflict record for a reconcile job: which files 2+ jobs edited. */}
      {job.kind === 'reconcile' && (job.overlaps?.length > 0 || job.conflictLabels?.length > 0) && (
        <div className="mb-2 mx-2.5 border border-[var(--color-status-warning)]/30 bg-[var(--color-status-warning)]/[0.07] px-2 py-1.5 text-[11px] leading-snug">
          <div className="flex items-center gap-1 font-medium text-[var(--color-status-warning)]">
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
            {job.overlaps?.length > 0
              ? `${job.overlaps.length} file${job.overlaps.length === 1 ? '' : 's'} edited by multiple jobs`
              : 'Merge conflicts on apply'}
          </div>
          {job.overlaps?.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5 font-mono text-muted-foreground/80">
              {job.overlaps.slice(0, 6).map((o) => (
                <div key={o.path} className="truncate" title={`${o.path} — ${o.labels.join(', ')}`}>
                  {o.path}
                </div>
              ))}
              {job.overlaps.length > 6 && (
                <div className="text-muted-foreground/60">+{job.overlaps.length - 6} more</div>
              )}
            </div>
          )}
          {job.conflictLabels?.length > 0 && (
            <div className="mt-1 text-muted-foreground/70">
              Textual conflict from: {job.conflictLabels.join(', ')}
            </div>
          )}
        </div>
      )}

      {job.error && (
        <div className="mb-2 mx-2.5 bg-destructive/5 px-2 py-1 text-[11px] leading-snug text-destructive/90 break-words">
          {job.error}
        </div>
      )}

      {expanded && (
        <>
          {/* Full streaming log, one <pre> of stream runs; skipped by the
              renderer while scrolled out of the pane. */}
          <div
            ref={logRef}
            className="mx-2.5 max-h-56 overflow-auto ins-well p-2 font-mono text-[11px] leading-relaxed [content-visibility:auto] [contain-intrinsic-size:auto_14rem]"
          >
            {job.output.length === 0 ? (
              <div className="text-muted-foreground/50">No output yet.</div>
            ) : (
              <pre className="m-0 [font:inherit] whitespace-pre-wrap break-words">
                {outputRuns(job.output).map((run, i) =>
                  run.stderr ? (
                    <span key={i} className="text-destructive/80">{run.text}</span>
                  ) : (
                    <Fragment key={i}>{run.text}</Fragment>
                  )
                )}
              </pre>
            )}
          </div>

          {/* Actions: emphasized primary on the left, ghost icons on the right */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 px-2.5 pb-2">
            {isRunning && (
              <PrimaryAction icon={Square} label="Cancel" onClick={() => actions.cancel(job.id)} variant="danger" title="Stop this running job" />
            )}
            {isDone && changedCount > 0 && (
              <PrimaryAction
                icon={GitCompare}
                label={`Review ${changedCount}`}
                onClick={() => actions.review(job.id)}
                variant="outline"
                title="Review the isolated diff before applying"
              />
            )}
            {canApprove && (
              <PrimaryAction
                icon={tcErrors ? AlertTriangle : isRace ? Trophy : Check}
                label={
                  tcChecking
                    ? 'Checking…'
                    : tcErrors
                    ? isRace
                      ? 'Keep anyway'
                      : 'Apply anyway'
                    : isRace
                    ? 'Keep this'
                    : 'Apply'
                }
                onClick={() => (isRace ? actions.pickWinner(job.id, tcErrors) : actions.approve(job.id, tcErrors))}
                disabled={tcChecking}
                variant={tcErrors ? 'danger' : 'primary'}
                title={
                  tcErrors
                    ? 'These changes have type errors — applying anyway skips the check. Review before committing.'
                    : isRace
                    ? 'Keep this candidate: applies it to your working tree and discards the other candidates'
                    : 'Apply these changes into your working tree — uncommitted, so you review and commit them yourself'
                }
              />
            )}
            {selectable && !showCheckbox && (
              <PrimaryAction
                icon={GitMerge}
                label="Select"
                onClick={() => actions.toggleSelect(job.id)}
                variant="outline"
                title="Select for reconcile: merge several finished jobs with an agent"
              />
            )}

            <div className="ml-auto flex items-center gap-0.5">
              {isDone && <IconAction icon={RotateCcw} title="Re-run job" onClick={() => actions.rerun(job.id)} />}
              {job.reportPath && <IconAction icon={FileText} title="View run report" onClick={() => actions.report(job.id)} />}
              {isDone && (job.logPath || job.output.length > 0) && (
                <IconAction icon={Copy} title="Copy output (use as a prompt elsewhere)" onClick={() => actions.copyOutput(job.id)} />
              )}
              {!isRunning && !archived && (
                <IconAction icon={Archive} title="Archive — hide from the list, keep everything" onClick={() => actions.archive(job.id)} />
              )}
              {archived && (
                <IconAction icon={ArchiveRestore} title="Restore to the jobs list" onClick={() => actions.unarchive(job.id)} />
              )}
              {!isRunning && (
                <IconAction
                  icon={Trash2}
                  title={job.worktreePath ? 'Discard changes' : 'Dismiss'}
                  onClick={() => actions.discard(job.id)}
                  danger
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

function PrimaryAction({ icon: Icon, label, onClick, variant = 'outline', title, disabled = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'flex shrink-0 items-center gap-1 whitespace-nowrap px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
        variant === 'primary' && 'text-[var(--ins-lamp)] shadow-[inset_0_0_0_1px_var(--ins-lamp)] hover:bg-[var(--ins-lamp)] hover:text-[var(--ins-panel)]',
        variant === 'outline' && 'border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent',
        variant === 'danger' && 'border border-destructive/40 text-destructive hover:bg-destructive/10'
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function IconAction({ icon: Icon, title, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent cursor-pointer transition-colors',
        danger ? 'hover:text-destructive' : 'hover:text-sidebar-foreground'
      )}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}
