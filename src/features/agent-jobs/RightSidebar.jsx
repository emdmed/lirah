import { useState, useEffect, useLayoutEffect, useRef, useMemo, memo, Fragment, Suspense } from 'react';
import { basename } from '../../utils/pathUtils';
import { formatTimer } from '../../lib/formatDuration';
import { getSettings, setSetting, useSeededSetting } from '../settings/settingsStore';
import { Archive, ChevronDown, ChevronRight, Collapse, Copy, Edit, Expand, Jobs, Log, Plan, Play, Stop, Trash, Undo, Upload, View, Warning } from '@/components/icons';
import { PanelButton } from '../../components/instrument/PanelButton';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { SubagentList } from '../../components/AgentSidebar';
import { useSubagentContext } from '../../contexts/SubagentContext';
import { useToast } from '../toast';
import { useConfirm, useDialog } from '../dialogs/DialogProvider';
import { Lamp, jobLamp } from '../../components/instrument/Lamp';
import { PaneLegend } from '../../components/instrument/PaneLegend';
import { TabButton } from '../../components/instrument/TabButton';
import { Keycap } from '../../components/instrument/Keycap';
import { Span, SpanRuler, SpanScale } from '../../components/instrument/Span';
import { jobsPaneRequest, requestTabsPane } from './jobsPane';
import { jobSteps, useAgentJobs } from './AgentJobsContext';
import { lazyNamed } from '../../lib/lazyNamed';
import { useTabManager } from '../tabs/TabContext';
import { PlansPane } from '../plans/PlansPane';
import { ArtifactsPane, useArtifacts } from '../artifacts/ArtifactsPane';
import { EmptyLine, NewRow } from '../plans/parts';
import { usePlans } from '../plans/PlansContext';
import { useRepoRoot } from '../plans/planRepoRoot';
import { isOpenPlan } from '../plans/planModel';
import { TasksPane } from '../tasks/TasksPane';
import { WorklogPane } from '../worklog/WorklogPane';
import { useOpenTaskCount } from '../tasks/TasksContext';
import { buttonVariants } from '../../components/ui/button';
import { setPaneDrag } from '../../lib/paneDrag';

// Collapsed-rail keys stack a count over a word, so they take the ghost role with no fixed size.
const RAIL_KEY = cn(buttonVariants({ variant: 'ghost', size: null }), 'flex-col gap-0.5 w-6 px-0.5 py-1');

// Loaded on first open, mounted only while open.
const MarkdownViewerDialog = lazyNamed(() => import('../markdown/MarkdownViewerDialog'), 'MarkdownViewerDialog');
const RunJobDialog = lazyNamed(() => import('./RunJobDialog'), 'RunJobDialog');

const MIN_WIDTH = 224;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 256;

// Widened, the pane takes half the window for reading plans and reports;
// dragging can also reach that far.
const halfWindow = () => Math.round(window.innerWidth / 2);
const maxWidth = () => Math.max(MAX_WIDTH, halfWindow());

// Time between two epoch-ms timestamps (endedAt || now), or null before it started.
function jobDuration(startedAt, endedAt) {
  return startedAt ? formatTimer((endedAt || Date.now()) - startedAt) : null;
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

// The repo a job works on (older jobs ran in a throwaway worktree).
const jobRepo = (job) => job.repoPath || job.cwd;

const spanItem = (j) => ({ startedAt: j.startedAt, endedAt: j.endedAt, running: j.status === 'running' });

function RightSidebarPanel({ projectPath, onNewTab }) {
  const {
    jobs,
    cancelJob,
    rerunJob,
    discardJob,
    archiveJob,
    unarchiveJob,
    recipes,
    runRecipe,
    deleteRecipe,
  } = useAgentJobs();
  const { repoRoot } = useRepoRoot(projectPath);
  const jobsRepo = repoRoot || projectPath;
  const repoRecipes = recipes.filter((r) => r.repoPath === jobsRepo);
  const { totalActiveCount } = useSubagentContext();
  const openPlans = useOpenPlanCount(projectPath);
  const artifacts = useArtifacts(projectPath);
  const { workspaceTabs, activeWorkspaceId, activeTabId } = useTabManager();
  const dialog = useDialog();
  const openTasks = useOpenTaskCount(activeWorkspaceId);
  const toast = useToast();
  const confirm = useConfirm();

  // null = automatic: open, since the pane is where the tabs live. Only the
  // user folds it away (» or Alt+4); the rail keeps a new-tab key.
  const [collapsedOverride, setCollapsedOverride] = useState(null);
  const [tab, setTab] = useState('tasks');
  // Like agents, only while there are some (or it's the open section): a fifth tab pushes log and jobs off the row.
  const showArtifacts = artifacts.names?.length > 0 || tab === 'artifacts';
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null); // recipe open in the dialog
  const [reportPath, setReportPath] = useState(null); // markdown report being viewed
  const [showArchived, setShowArchived] = useState(false);

  // Archived jobs are stored alongside the rest but kept out of immediate sight.
  const visibleJobs = jobs.filter((j) => !j.archived);
  const archivedJobs = jobs.filter((j) => j.archived);
  // P6: the durations drawn in a list share one scale.
  const spanJobs = visibleJobs.map(spanItem);
  const collapsed = collapsedOverride ?? false;
  const newTabTitle = 'New tab (Ctrl+T)';

  useEffect(() => {
    const onRequest = (e) => {
      const target = e.detail?.tab;
      // Toggling a pane that isn't showing switches to it instead of folding away.
      if (e.detail?.action === 'toggle' && (!target || target === tab || collapsed)) setCollapsedOverride(!collapsed);
      else setCollapsedOverride(false);
      if (target) setTab(target);
    };
    return jobsPaneRequest.subscribe(onRequest);
  }, [collapsed, tab]);

  // User-resizable panel width — persisted so it survives reloads. A narrow
  // fixed panel is what made the cards feel squashed.
  const [width, setWidth] = useState(() => {
    const saved = getSettings().jobsSidebarWidth;
    return saved ? Math.min(maxWidth(), Math.max(MIN_WIDTH, saved)) : DEFAULT_WIDTH;
  });
  const paneRef = useRef(null);

  // Half-window toggle, kept apart from the dragged width so un-widening
  // restores it. Tracks the window while widened.
  const [wide, setWide] = useSeededSetting('jobsSidebarWide');
  const [half, setHalf] = useState(halfWindow);
  useEffect(() => {
    if (!wide) return;
    const onResize = () => setHalf(halfWindow());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [wide]);
  const toggleWide = () => setWide((w) => !w);
  const paneWidth = wide ? Math.max(width, half) : width;

  // A drag writes the width straight onto the pane once per frame; state and
  // storage are committed on mouseup so the pane doesn't re-render per move.
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = paneWidth;
    const limit = maxWidth();
    let frame = 0;
    let pending = null;
    const apply = () => {
      frame = 0;
      if (paneRef.current) paneRef.current.style.width = `${pending}px`;
    };
    const onMove = (ev) => {
      // Panel is anchored right, so dragging left (smaller clientX) widens it.
      pending = Math.min(limit, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onUp = () => {
      cancelAnimationFrame(frame);
      setPaneDrag(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (pending == null) return;
      apply();
      setWidth(pending);
      setSetting('jobsSidebarWidth', pending);
      // A drag sets the width by hand, which ends the half-window mode.
      if (wide) toggleWide();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    setPaneDrag(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // ←/→ on the focused handle: 16px a step, 64px with Shift. Left widens.
  const resizeByKey = (e) => {
    const dir = { ArrowLeft: 1, ArrowRight: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const next = Math.min(maxWidth(), Math.max(MIN_WIDTH, paneWidth + dir * (e.shiftKey ? 64 : 16)));
    setWidth(next);
    setSetting('jobsSidebarWidth', next);
    if (wide) toggleWide();
  };

  const runningJobs = jobs.filter((j) => j.status === 'running').length;

  // Only a job from before steps existed has a worktree; discarding deletes it.
  const handleDiscard = async (id) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    if (job.worktreePath) {
      const ok = await confirm({
        title: `Discard ${job.label || 'this job'}?`,
        description: `Its worktree ${job.worktreePath} is deleted with any changes left in it. This can't be undone.`,
        confirmLabel: 'Discard',
        destructive: true,
      });
      if (!ok) return;
    }
    if (job.status === 'running') await cancelJob(id);
    await discardJob(id);
  };

  const handleRerun = async (id) => {
    await rerunJob(id);
    toast.info('Re-running job');
  };

  const handleRunRecipe = async (recipe) => {
    try {
      await runRecipe(recipe.id);
      toast.info(`Running ${recipe.name}`);
    } catch (err) {
      toast.error(`Could not run ${recipe.name}: ${err.message || err}`);
    }
  };

  const handleDeleteRecipe = async (recipe) => {
    const ok = await confirm({
      title: `Delete recipe ${recipe.name}?`,
      description: 'Its runs stay in the list.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) deleteRecipe(recipe.id);
  };

  const openDialog = (recipe = null) => {
    setEditingRecipe(recipe);
    setDialogOpen(true);
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

  // Auto-expand + jump to Jobs when a new job is launched. Jobs restored from
  // disk at startup were started before mount, so they keep the Tabs default.
  const prevCount = useRef(jobs.length);
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    if (jobs.length > prevCount.current && jobs.some((j) => j.startedAt >= mountedAt.current)) {
      setCollapsedOverride(null);
      setTab('jobs');
    }
    prevCount.current = jobs.length;
  }, [jobs.length]);


  // Card actions take a job id and keep their identity across renders, so
  // memo(JobCard) re-renders only the card whose job changed. They forward to
  // the latest handlers, which close over `jobs` (new on every output batch).
  const handlersRef = useRef(null);
  useLayoutEffect(() => {
    handlersRef.current = {
      cancel: cancelJob,
      rerun: handleRerun,
      discard: handleDiscard,
      archive: archiveJob,
      unarchive: unarchiveJob,
      report: (id) => setReportPath(jobs.find((j) => j.id === id)?.reportPath ?? null),
      copyOutput: handleCopyOutput,
    };
  });
  const cardActions = useMemo(() => {
    const forward = (name) => (...args) => handlersRef.current[name](...args);
    return Object.fromEntries(
      ['cancel', 'rerun', 'discard', 'archive', 'unarchive', 'report', 'copyOutput']
        .map((name) => [name, forward(name)])
    );
  }, []);

  // One place that knows how a job card is wired, shared by the active list and
  // the archived section.
  const renderCard = (job, { archived = false } = {}) => (
    <JobCard key={job.id} job={job} archived={archived} actions={cardActions} />
  );

  if (collapsed) {
    // One lamp per job reads the whole queue at a glance; the pane index sits
    // on a keycap instead of a rotated label.
    const railJobs = visibleJobs.slice(0, 8);
    return (
      <div data-pane="4" className="flex flex-col items-center gap-2 py-2 my-3 mx-3 shrink-0 w-7 edge-engraved bg-[var(--ins-panel)]">
        <button
          onClick={() => setCollapsedOverride(false)}
          type="button"
          className={cn(RAIL_KEY, 'gap-2')}
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
              <span className="text-[11px] tabular-nums text-muted-foreground">+{visibleJobs.length - railJobs.length}</span>
            )}
          </div>
        )}
        {totalActiveCount > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground" title="Active agents">
            {totalActiveCount}
          </span>
        )}
        {/* Two labelled keys: the tab key opens a tab here, the job key a
            headless background run. */}
        <div className="mt-auto flex flex-col items-center gap-2">
          <button
            onClick={() => requestTabsPane('open')}
            type="button"
            className={RAIL_KEY}
            title="Show tabs"
            aria-label={`Show tabs (${workspaceTabs.length} in this workspace)`}
          >
            <span className="text-[11px] tabular-nums">{workspaceTabs.length}</span>
            <span className="ins-legend text-[11px] leading-none">tabs</span>
          </button>
          <button
            onClick={() => {
              setCollapsedOverride(false);
              setTab('tasks');
            }}
            type="button"
            className={RAIL_KEY}
            title="Show tasks (Alt+Q adds one)"
            aria-label={`Show tasks (${openTasks} open)`}
          >
            <span className="text-[11px] tabular-nums">{openTasks}</span>
            <span className="ins-legend text-[11px] leading-none">tasks</span>
          </button>
          {onNewTab && (
            <button
              onClick={onNewTab}
              type="button"
              className={RAIL_KEY}
              title={newTabTitle}
              aria-label="New tab"
            >
              <span className="text-[11px] leading-none">+</span>
              <span className="ins-legend text-[11px] leading-none">tab</span>
            </button>
          )}
          <button
            onClick={() => {
              setCollapsedOverride(false);
              setTab('jobs');
              openDialog();
            }}
            type="button"
            className={RAIL_KEY}
            title="New background job"
            aria-label="New background job"
          >
            <span className="text-[11px] leading-none">+</span>
            <span className="ins-legend text-[11px] leading-none">job</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Resize gutter, styled like the files pane's: drag, or focus it and use ←/→. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Workspace pane"
        aria-valuenow={paneWidth}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth()}
        tabIndex={0}
        onMouseDown={startResize}
        onKeyDown={resizeByKey}
        className="relative w-3 shrink-0 cursor-col-resize outline-none before:absolute before:inset-y-1.5 before:left-1/2 before:w-px before:-ml-px before:transition-colors hover:before:bg-[var(--ins-edge-strong)] active:before:bg-[var(--ins-lamp)] focus-visible:before:bg-[var(--ins-lamp)]"
        title="Drag to resize (or ←/→)"
      />
    <div
      ref={paneRef}
      style={{ width: paneWidth }}
      onKeyDown={(e) => {
        if (e.target.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return;
        // [ ] cycle sections. Alt is allowed and AltGraph excused: ISO layouts type [ ] with AltGr.
        if ((e.key === '[' || e.key === ']') && (e.getModifierState('AltGraph') || !(e.ctrlKey || e.metaKey))) {
          const sections = ['tasks', 'plans', ...(showArtifacts ? ['artifacts'] : []), 'log', 'jobs', ...(totalActiveCount > 0 || tab === 'agents' ? ['agents'] : [])];
          const step = e.key === ']' ? 1 : -1;
          e.preventDefault();
          setTab(sections[(sections.indexOf(tab) + step + sections.length) % sections.length]);
          return;
        }
        // ? opens the shortcuts at this pane's section. The pane sits outside the tabs, so open it in the active tab's scope.
        if (e.key === '?' && !(e.ctrlKey || e.metaKey || e.altKey)) {
          e.preventDefault();
          dialog.open('help', { section: 'Workspace pane' }, activeTabId);
          return;
        }
        // N presses the jobs/plans section's new row while focus is in the pane (tasks handles its own).
        if ((tab !== 'jobs' && tab !== 'plans') || e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
        const row = paneRef.current?.querySelector('#workspace-section [data-new-row]');
        if (!row) return;
        e.preventDefault();
        row.click();
      }}
      tabIndex={-1}
      data-pane="4"
      data-title={`[4] ${tab}`}
      data-legend
      className="tui-pane flex flex-col shrink-0 overflow-hidden pt-[16px] my-1.5 mr-3 text-sidebar-foreground outline-none"
    >
      <PaneLegend
        index={4}
        title="Workspace"
        lamp={runningJobs + totalActiveCount > 0 ? 'on' : undefined}
        trailing={
          <>
            <PanelButton
              icon={wide ? Collapse : Expand}
              onClick={toggleWide}
              title={wide ? 'Restore pane width' : 'Widen pane to half the window'}
              aria-label={wide ? 'Restore pane width' : 'Widen pane'}
              aria-pressed={wide}
            />
            <PanelButton
              icon={ChevronRight}
              onClick={() => setCollapsedOverride(true)}
              title="Collapse pane"
              aria-label="Collapse pane"
            />
          </>
        }
      />

      {/* Section switch; agents only while there are subagents. Tabs and features live in the files pane. */}
      {/* Same height as the files pane's control bank, so both header rules
          sit on one line across the window. */}
      <div role="tablist" aria-label="Workspace sections" className="flex items-end gap-2 px-2 h-9 shrink-0 edge-b-engraved">
        <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')} label="tasks" count={openTasks} />
        <TabButton active={tab === 'plans'} onClick={() => setTab('plans')} label="plans" count={openPlans} />
        {showArtifacts && (
          <TabButton active={tab === 'artifacts'} onClick={() => setTab('artifacts')} label="artifacts" count={artifacts.names?.length} />
        )}
        <TabButton active={tab === 'log'} onClick={() => setTab('log')} label="log" />
        <TabButton active={tab === 'jobs'} onClick={() => setTab('jobs')} label="jobs" count={runningJobs} lamp={runningJobs > 0} />
        {(totalActiveCount > 0 || tab === 'agents') && (
          <TabButton active={tab === 'agents'} onClick={() => setTab('agents')} label="agents" count={totalActiveCount} />
        )}
      </div>

      <div id="workspace-section" role="tabpanel" aria-label={tab} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 pb-1.5 flex flex-col">
        {/* Plans and artifacts follow the active tab's project, unlike jobs; name it.
            Tasks name their own list (workspace or global) in the composer. */}
        {projectPath && (tab === 'plans' || tab === 'artifacts') && (
          <div className="ins-legend text-[11px] text-muted-foreground px-3 pt-2 pb-2.5 truncate shrink-0" title={projectPath}>
            {basename(projectPath)}
          </div>
        )}
        {tab === 'agents' ? (
          <SubagentList />
        ) : tab === 'plans' ? (
          <PlansPane projectPath={projectPath} />
        ) : tab === 'artifacts' ? (
          <ArtifactsPane projectPath={projectPath} repoRoot={artifacts.repoRoot} names={artifacts.names} />
        ) : tab === 'tasks' ? (
          <TasksPane projectPath={projectPath} />
        ) : tab === 'log' ? (
          <WorklogPane projectPath={projectPath} />
        ) : (
          <>
            {repoRecipes.length > 0 && (
              <div className="flex flex-col edge-b-engraved pb-1">
                <div className="ins-legend px-2.5 pt-2 pb-1 text-[11px] text-muted-foreground truncate" title={jobsRepo}>
                  recipes · {basename(jobsRepo)}
                </div>
                {repoRecipes.map((r) => (
                  <RecipeRow
                    key={r.id}
                    recipe={r}
                    onRun={() => handleRunRecipe(r)}
                    onEdit={() => openDialog(r)}
                    onDelete={() => handleDeleteRecipe(r)}
                  />
                ))}
              </div>
            )}
            {visibleJobs.length === 0 ? (
              <EmptyLine hint="N dispatches a headless agent run">
                {archivedJobs.length > 0 ? 'no active jobs' : 'no jobs'}
              </EmptyLine>
            ) : (
              <SpanScale items={spanJobs}>
              <div className="flex flex-col">
                <div className="flex items-center justify-between px-2.5 pt-1 text-[11px] text-muted-foreground">
                  <span>· all repos</span>
                  <SpanRuler />
                </div>
                {visibleJobs.map((job) => renderCard(job))}
              </div>
              </SpanScale>
            )}

            <NewRow label="job" keys="N" onClick={() => openDialog()} />

            {/* Archived jobs: stored but out of immediate sight, browsable on demand. */}
            {archivedJobs.length > 0 && (
              <div className="mt-2 border-t border-t-sidebar-border/60 pt-1">
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground hover:text-sidebar-foreground cursor-pointer transition-colors"
                >
                  {showArchived ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <Archive size={12} />
                  Archived
                  <span className="tabular-nums">{archivedJobs.length}</span>
                </button>
                {showArchived && (
                  <SpanScale items={archivedJobs.map(spanItem)}>
                    <div className="flex flex-col gap-1.5 px-2 pt-0.5 opacity-80">
                      {archivedJobs.map((job) => renderCard(job, { archived: true }))}
                    </div>
                  </SpanScale>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <Suspense fallback={null}>
      {dialogOpen && (
        <RunJobDialog open={dialogOpen} onOpenChange={setDialogOpen} repoPath={jobsRepo} recipe={editingRecipe} />
      )}

      {reportPath && (
          <MarkdownViewerDialog
            open
            onOpenChange={(o) => !o && setReportPath(null)}
            filePath={reportPath}
            repoPath={projectPath}
          />
      )}
      </Suspense>
    </div>
    </>
  );
}

// App re-renders for reasons of its own (tabs, attention, updates); its props
// here are a path and a stable callback.
export const RightSidebar = memo(RightSidebarPanel);

// A saved recipe: its name and step count, run / edit / delete.
function RecipeRow({ recipe, onRun, onEdit, onDelete }) {
  const n = recipe.steps.length;
  return (
    <div className="group flex items-center gap-2 px-2.5 py-1 text-xs hover:bg-[color-mix(in_srgb,var(--ins-lamp)_4%,transparent)]">
      <span className="min-w-0 flex-1 truncate" title={recipe.steps.map((st, i) => `${i + 1}. ${st.cli}: ${st.prompt}`).join('\n')}>
        {recipe.name}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{n} step{n === 1 ? '' : 's'}</span>
      <IconAction icon={Edit} title={`Edit ${recipe.name}`} onClick={onEdit} />
      <IconAction icon={Trash} title={`Delete ${recipe.name}`} onClick={onDelete} danger />
      <IconAction icon={Play} title={`Run ${recipe.name}`} onClick={onRun} />
    </div>
  );
}

// Plans in the active tab's repo that still have a chunk to do or underway.
function useOpenPlanCount(projectPath) {
  const { repoRoot } = useRepoRoot(projectPath);
  const { plans } = usePlans(repoRoot);
  return useMemo(() => (plans || []).filter(isOpenPlan).length, [plans]);
}

// A job's duration line (P6): lit while running, fault when it failed, muted
// when it was stopped. The Span owns its ticker, so only it redraws each second.
function spanTone(status) {
  if (status === 'running') return 'live';
  if (status === 'failed') return 'fault';
  if (status === 'cancelled' || status === 'interrupted') return 'muted';
  return 'done';
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

const JobCard = memo(function JobCard({ job, archived, actions }) {
  const [expanded, setExpanded] = useState(false);
  const logRef = useRef(null);
  const meta = STATUS_META[job.status] || STATUS_META.done;
  const lamp = jobLamp(job.status);
  const isRunning = job.status === 'running';
  const isDone =
    job.status === 'done' ||
    job.status === 'failed' ||
    job.status === 'conflict' ||
    job.status === 'interrupted';
  const duration = isRunning ? null : jobDuration(job.startedAt, job.endedAt);
  const stepCount = jobSteps(job).length;
  // A status word for anything that isn't a clean running/done state.
  const showStatusChip = !isRunning && job.status !== 'done';

  // Keep the expanded log pinned to the newest output while a job streams. Keyed
  // on the array, not its length: once the buffer caps the length stops changing.
  useEffect(() => {
    if (expanded && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [expanded, job.output]);

  return (
    // One row per job, split by hairlines: lamp, title and time on the first
    // line, agent and step on the second. Output and actions open on demand.
    <div
      className={cn(
        'edge-b-engraved transition-colors',
        expanded ? 'bg-[color-mix(in_srgb,var(--ins-lamp)_6%,transparent)]' : 'hover:bg-[color-mix(in_srgb,var(--ins-lamp)_4%,transparent)]'
      )}
    >
      <div className="flex items-center gap-2 px-2.5 pt-2">
        <Lamp {...lamp} label={meta.label} />
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-w-0 flex-1 truncate text-left text-xs cursor-pointer hover:text-foreground"
          title={expanded ? 'Hide output and actions' : `${job.label} — show output and actions`}
        >
          {job.label}
        </button>
        {job.startedAt && (
          <Span
            startedAt={job.startedAt}
            endedAt={job.endedAt}
            tone={spanTone(job.status)}
            title={isRunning ? 'Running' : `Took ${duration}`}
          />
        )}
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 pr-2.5 pb-2 text-[11px]">
        <span className="min-w-0 truncate text-muted-foreground">
          {jobRepo(job) && <span className="text-foreground">{basename(jobRepo(job))} · </span>}
          {job.cli}
        </span>
        {stepCount > 1 && (
          <span className="tabular-nums text-muted-foreground" title="Step">
            {isRunning || job.status === 'failed' ? `step ${(job.stepIndex ?? 0) + 1}/${stepCount}` : `${stepCount} steps`}
          </span>
        )}
        {showStatusChip && <span style={{ color: meta.color }}>{meta.label}</span>}
        {isRunning && job.idleSecs > 0 && (
          <span
            className="inline-flex items-center gap-0.5"
            style={{ color: 'var(--color-status-warning)' }}
            title="No output or CPU work. The agent may be waiting on an approval it can't get in a headless run. It is stopped after 15 min idle."
          >
            <Warning size={10} />
            idle {Math.floor(job.idleSecs / 60)}m
          </span>
        )}
      </div>

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
              <div className="text-muted-foreground">No output yet.</div>
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
              <PrimaryAction icon={Stop} label="Cancel" onClick={() => actions.cancel(job.id)} variant="danger" title="Stop this running job" />
            )}

            <div className="ml-auto flex items-center gap-0.5">
              {isDone && <IconAction icon={Undo} title="Re-run job" onClick={() => actions.rerun(job.id)} />}
              {job.reportPath && <IconAction icon={Plan} title="View run report" onClick={() => actions.report(job.id)} />}
              {isDone && (job.logPath || job.output.length > 0) && (
                <IconAction icon={Copy} title="Copy output (use as a prompt elsewhere)" onClick={() => actions.copyOutput(job.id)} />
              )}
              {!isRunning && !archived && (
                <IconAction icon={Archive} title="Archive — hide from the list, keep everything" onClick={() => actions.archive(job.id)} />
              )}
              {archived && (
                <IconAction icon={Upload} title="Restore to the jobs list" onClick={() => actions.unarchive(job.id)} />
              )}
              {!isRunning && (
                <IconAction
                  icon={Trash}
                  title={job.worktreePath ? 'Discard worktree' : 'Dismiss'}
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
        'flex shrink-0 items-center gap-1 whitespace-nowrap px-2 py-1 text-[11px] cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
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
