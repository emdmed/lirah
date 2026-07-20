import { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Boxes,
  Plus,
  PanelRightClose,
  PanelRightOpen,
  Square,
  GitCompare,
  Check,
  Trash2,
  Loader2,
  FileText,
  GitMerge,
  RotateCcw,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Checkbox } from '../../components/ui/checkbox';
import { SubagentList } from '../../components/AgentSidebar';
import { useSubagentContext } from '../../contexts/SubagentContext';
import { useToast } from '../toast';
import { GitDiffDialog } from '../git';
import { useBranchName } from '../git/useBranchName';
import { MarkdownViewerDialog } from '../markdown';
import { useAgentJobs } from './AgentJobsContext';
import { RunJobDialog } from './RunJobDialog';

const MIN_WIDTH = 224;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 288;
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
  applied: { color: 'var(--color-primary)', label: 'applied' },
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

export function RightSidebar({ projectPath }) {
  const { jobs, cancelJob, approveJob, rerunJob, reconcileJobs, discardJob } = useAgentJobs();
  const { totalActiveCount } = useSubagentContext();
  const toast = useToast();
  const branchName = useBranchName(projectPath);

  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState('jobs');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [review, setReview] = useState(null); // { jobId, filePath }
  const [reportPath, setReportPath] = useState(null); // markdown report being viewed
  const [selected, setSelected] = useState(() => new Set()); // job ids picked for reconcile
  const [reconciling, setReconciling] = useState(false);

  // User-resizable panel width — persisted so it survives reloads. A narrow
  // fixed panel is what made the cards feel squashed.
  const [width, setWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(WIDTH_KEY), 10);
    return Number.isFinite(saved) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, saved)) : DEFAULT_WIDTH;
  });
  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev) => {
      // Panel is anchored right, so dragging left (smaller clientX) widens it.
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX))));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const runningJobs = jobs.filter((j) => j.status === 'running').length;

  // Tick once a second while any job is running so elapsed times stay live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (runningJobs === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runningJobs]);

  // Keep the selection in sync with the jobs that are still reconcilable
  // (finished/discarded jobs drop out on their own).
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(jobs.filter(isReconcilable).map((j) => j.id));
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
        toast.info(
          `Reconciling ${count} job${count === 1 ? '' : 's'} — an agent is merging and verifying; review it when it finishes`
        );
      } else if (res?.error) {
        toast.error(`Reconcile failed: ${res.error}`);
      }
    } finally {
      setReconciling(false);
      setSelected(new Set());
    }
  };

  const handleApprove = async (id) => {
    const count = jobs.find((j) => j.id === id)?.changedFiles.length ?? 0;
    const result = await approveJob(id);
    if (result?.ok) {
      const files = `${count} file${count === 1 ? '' : 's'}`;
      toast.success(`Applied ${files} into your ${branchName ? `${branchName} ` : ''}working tree — uncommitted`);
    } else if (result?.error) {
      toast.error(`Apply failed: ${result.error}`);
    }
  };

  const handleRerun = async (id) => {
    await rerunJob(id);
    toast.info('Re-running job');
  };

  // Auto-expand + jump to Jobs when a new job is launched.
  const prevCount = useRef(jobs.length);
  useEffect(() => {
    if (jobs.length > prevCount.current) {
      setCollapsed(false);
      setTab('jobs');
    }
    prevCount.current = jobs.length;
  }, [jobs.length]);

  const reviewJob = review ? jobs.find((j) => j.id === review.jobId) : null;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-2 shrink-0 w-8 border-l border-l-sidebar-border bg-sidebar">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 rounded hover:bg-sidebar-accent cursor-pointer"
          title="Expand jobs sidebar"
        >
          <PanelRightOpen size={14} className="text-muted-foreground" />
        </button>
        <button
          onClick={() => {
            setCollapsed(false);
            setTab('jobs');
            setDialogOpen(true);
          }}
          className="p-1 rounded hover:bg-sidebar-accent cursor-pointer"
          title="New background job"
        >
          <Plus size={14} className="text-muted-foreground" />
        </button>
        {runningJobs > 0 && (
          <span className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--color-status-success)' }}>
            {runningJobs}
          </span>
        )}
        {totalActiveCount > 0 && (
          <span className="text-[10px] font-bold tabular-nums text-muted-foreground" title="Active agents">
            {totalActiveCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ width }}
      className="relative flex flex-col shrink-0 overflow-hidden border-l border-l-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      {/* Drag-to-resize handle sitting over the left edge. */}
      <div
        onMouseDown={startResize}
        className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary/60 transition-colors"
        title="Drag to resize"
      />

      {/* Header: tabs + collapse */}
      <div className="flex items-center justify-between px-1.5 py-1 shrink-0 border-b border-b-sidebar-border">
        <div className="flex items-center gap-0.5">
          <TabButton active={tab === 'jobs'} onClick={() => setTab('jobs')} icon={Bot} label="Jobs" count={runningJobs} />
          <TabButton active={tab === 'agents'} onClick={() => setTab('agents')} icon={Boxes} label="Agents" count={totalActiveCount} />
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-0.5 rounded hover:bg-sidebar-accent cursor-pointer"
          title="Collapse sidebar"
        >
          <PanelRightClose size={14} className="text-muted-foreground" />
        </button>
      </div>

      {tab === 'jobs' && (
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 shrink-0 border-b border-b-sidebar-border text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
        >
          <Plus size={12} />
          New background job
        </button>
      )}

      {tab === 'jobs' && selected.size > 0 && (
        <div className="flex flex-col gap-1.5 px-3 py-2 shrink-0 border-b border-b-sidebar-border bg-sidebar-accent/40">
          <div className="flex items-center gap-2">
            <button
              onClick={handleReconcile}
              disabled={reconciling}
              className="flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 cursor-pointer"
              title="Merge the selected jobs with an agent that resolves conflicts and verifies the combined result"
            >
              {reconciling ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
              Reconcile {selected.size}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={reconciling}
              className="text-[10px] text-muted-foreground hover:text-sidebar-foreground cursor-pointer disabled:opacity-60"
            >
              Clear
            </button>
          </div>
          <span className="text-[10px] leading-snug text-muted-foreground/70">
            An agent merges them in an isolated worktree and verifies the build. Review before applying.
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 py-1.5">
        {tab === 'agents' ? (
          <SubagentList />
        ) : jobs.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bot size={18} className="mx-auto mb-2 text-muted-foreground/30" />
            <div className="text-[11px] text-muted-foreground/60">No background jobs</div>
            <div className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/40">
              Dispatch a headless agent run with “New background job”.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 px-2">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                now={now}
                selectable={isReconcilable(job)}
                selected={selected.has(job.id)}
                onToggleSelect={() => toggleSelect(job.id)}
                onCancel={() => cancelJob(job.id)}
                onApprove={() => handleApprove(job.id)}
                onRerun={() => handleRerun(job.id)}
                onDiscard={() => discardJob(job.id)}
                onReview={() => setReview({ jobId: job.id, filePath: job.changedFiles[0]?.path || null })}
                onReport={() => setReportPath(job.reportPath)}
              />
            ))}
          </div>
        )}
      </div>

      <RunJobDialog open={dialogOpen} onOpenChange={setDialogOpen} projectPath={projectPath} />

      {reviewJob && review.filePath && (
        <div className="fixed inset-0 z-50">
          <GitDiffDialog
            open
            onOpenChange={(o) => !o && setReview(null)}
            filePath={review.filePath}
            repoPath={reviewJob.cwd}
            changedFiles={reviewJob.changedFiles}
            onFileChange={(filePath) => setReview((r) => ({ ...r, filePath }))}
          />
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
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-1.5 py-1 rounded text-[11px] cursor-pointer transition-colors',
        active ? 'bg-sidebar-accent text-sidebar-foreground font-medium' : 'text-muted-foreground hover:bg-sidebar-accent/50'
      )}
    >
      <Icon size={11} />
      {label}
      {count > 0 && (
        <span className="tabular-nums" style={{ color: 'var(--color-status-success)' }}>
          {count}
        </span>
      )}
    </button>
  );
}

// Middot divider between meta tokens.
function Dot() {
  return <span className="text-muted-foreground/30">·</span>;
}

function JobCard({ job, now, selectable, selected, onToggleSelect, onCancel, onApprove, onRerun, onDiscard, onReview, onReport }) {
  const [expanded, setExpanded] = useState(false);
  const logRef = useRef(null);
  const meta = STATUS_META[job.status] || STATUS_META.done;
  const changedCount = job.changedFiles.length;
  const isRunning = job.status === 'running';
  const isDone =
    job.status === 'done' ||
    job.status === 'failed' ||
    job.status === 'conflict' ||
    job.status === 'interrupted';
  const lastLines = expanded ? [] : job.output.slice(-2);
  const duration = formatDuration(job.startedAt, isRunning ? now : job.endedAt);
  const stat = job.diffStat;
  const hasStat = stat && (stat.added > 0 || stat.removed > 0);
  // A dedicated status chip for anything that isn't a clean running/done state.
  const showStatusChip = !isRunning && job.status !== 'done';
  const canApprove = isDone && !!job.worktreePath && changedCount > 0;

  // Keep the expanded log pinned to the newest output while a job streams.
  useEffect(() => {
    if (expanded && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [expanded, job.output.length]);

  return (
    <div
      className={cn(
        'rounded-sm border transition-colors',
        selected ? 'border-primary/70 bg-primary/[0.06]' : 'border-sidebar-border/60 hover:border-sidebar-border'
      )}
    >
      {/* Header: status marker + label + live duration */}
      <div className="flex items-start gap-2 px-2.5 pt-2">
        {selectable ? (
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <span
            className={cn('mt-1 inline-block h-2 w-2 rounded-full shrink-0', isRunning && 'animate-pulse')}
            style={{ backgroundColor: meta.color, opacity: isRunning ? 1 : 0.6 }}
          />
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-1 text-left cursor-pointer group"
          title={expanded ? 'Hide output' : 'Show full output'}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground group-hover:text-sidebar-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground group-hover:text-sidebar-foreground" />
          )}
          <span className="text-xs font-medium leading-snug line-clamp-2 break-words">{job.label}</span>
        </button>

        {isRunning && (
          <span className="flex items-center gap-1 shrink-0 pt-0.5 text-[10px] tabular-nums text-muted-foreground">
            {duration}
            <Loader2 className="h-3 w-3 animate-spin" />
          </span>
        )}
      </div>

      {/* Meta line: cli, isolation, diff stat, status */}
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[2.6rem] pr-2.5 text-[10px]">
        <span className="uppercase tracking-wide text-muted-foreground/80">{job.cli}</span>
        {job.kind === 'reconcile' && (
          <span className="inline-flex items-center gap-1.5">
            <Dot />
            <span className="inline-flex items-center gap-0.5 font-medium text-primary/80">
              <GitMerge className="h-2.5 w-2.5" />
              merge
            </span>
          </span>
        )}
        {job.useWorktree && (
          <span className="inline-flex items-center gap-1.5">
            <Dot />
            <span className="text-muted-foreground/50">worktree</span>
          </span>
        )}
        {!isRunning && duration && (
          <span className="inline-flex items-center gap-1.5">
            <Dot />
            <span className="tabular-nums text-muted-foreground/60">{duration}</span>
          </span>
        )}
        {hasStat && (
          <span className="inline-flex items-center gap-1.5">
            <Dot />
            <span className="tabular-nums whitespace-nowrap">
              <span style={{ color: 'var(--color-status-success)' }}>+{stat.added}</span>{' '}
              <span className="text-destructive/80">−{stat.removed}</span>
            </span>
          </span>
        )}
        {showStatusChip && (
          <span className="inline-flex items-center gap-1.5">
            <Dot />
            <span className="uppercase tracking-wide font-medium" style={{ color: meta.color }}>
              {meta.label}
            </span>
          </span>
        )}
      </div>

      {/* Collapsed preview: last couple of output lines */}
      {lastLines.length > 0 && (
        <div className="mt-1.5 mx-2.5 rounded-sm bg-background/40 px-2 py-1 font-mono text-[10px] leading-snug text-muted-foreground/70">
          {lastLines.map((l, i) => (
            <div key={i} className={cn('truncate', l.stream === 'stderr' && 'text-destructive/80')}>
              {l.chunk || ' '}
            </div>
          ))}
        </div>
      )}

      {/* Expanded: full streaming log */}
      {expanded && (
        <div
          ref={logRef}
          className="mt-1.5 mx-2.5 max-h-56 overflow-auto rounded-sm border border-sidebar-border/60 bg-background/50 p-2 font-mono text-[10px] leading-relaxed"
        >
          {job.output.length === 0 ? (
            <div className="text-muted-foreground/50">No output yet.</div>
          ) : (
            job.output.map((l, i) => (
              <div key={i} className={cn('whitespace-pre-wrap break-words', l.stream === 'stderr' && 'text-destructive/80')}>
                {l.chunk || ' '}
              </div>
            ))
          )}
        </div>
      )}

      {job.error && (
        <div className="mt-1.5 mx-2.5 rounded-sm bg-destructive/5 px-2 py-1 text-[10px] leading-snug text-destructive/90 break-words">
          {job.error}
        </div>
      )}

      {/* Actions: emphasized primary on the left, ghost icons on the right */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-2.5 pb-2">
        {isRunning && (
          <PrimaryAction icon={Square} label="Cancel" onClick={onCancel} variant="danger" title="Stop this running job" />
        )}
        {isDone && changedCount > 0 && (
          <PrimaryAction
            icon={GitCompare}
            label={`Review ${changedCount}`}
            onClick={onReview}
            variant="outline"
            title="Review the isolated diff before applying"
          />
        )}
        {canApprove && (
          <PrimaryAction
            icon={Check}
            label="Apply"
            onClick={onApprove}
            variant="primary"
            title="Apply these changes into your working tree — uncommitted, so you review and commit them yourself"
          />
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {isDone && <IconAction icon={RotateCcw} title="Re-run job" onClick={onRerun} />}
          {job.reportPath && <IconAction icon={FileText} title="View run report" onClick={onReport} />}
          {!isRunning && (
            <IconAction
              icon={Trash2}
              title={job.worktreePath ? 'Discard changes' : 'Dismiss'}
              onClick={onDiscard}
              danger
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PrimaryAction({ icon: Icon, label, onClick, variant = 'outline', title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:opacity-90',
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
