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
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { SubagentList } from '../../components/AgentSidebar';
import { useSubagentContext } from '../../contexts/SubagentContext';
import { GitDiffDialog } from '../git';
import { MarkdownViewerDialog } from '../markdown';
import { useAgentJobs } from './AgentJobsContext';
import { RunJobDialog } from './RunJobDialog';

const STATUS_META = {
  running: { color: 'var(--color-status-success)', label: 'running' },
  done: { color: 'var(--color-status-success)', label: 'done' },
  applied: { color: 'var(--color-primary)', label: 'applied' },
  failed: { color: 'var(--color-destructive)', label: 'failed' },
  cancelled: { color: 'var(--color-muted-foreground)', label: 'cancelled' },
};

export function RightSidebar({ projectPath }) {
  const { jobs, cancelJob, approveJob, discardJob } = useAgentJobs();
  const { totalActiveCount } = useSubagentContext();

  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState('jobs');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [review, setReview] = useState(null); // { jobId, filePath }
  const [reportPath, setReportPath] = useState(null); // markdown report being viewed

  const runningJobs = jobs.filter((j) => j.status === 'running').length;

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
    <div className="flex flex-col shrink-0 overflow-hidden w-48 border-l border-l-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Header: tabs + collapse */}
      <div className="flex items-center justify-between px-1 py-1 shrink-0 border-b border-b-sidebar-border">
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
          className="flex items-center gap-1.5 px-2 py-1.5 shrink-0 border-b border-b-sidebar-border text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Plus size={12} />
          New background job
        </button>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {tab === 'agents' ? (
          <SubagentList />
        ) : jobs.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <Bot size={16} className="mx-auto mb-2 text-muted-foreground/30" />
            <div className="text-[11px] text-muted-foreground/50">No background jobs</div>
            <div className="mt-1 text-[10px] text-muted-foreground/30">
              Dispatch a headless agent run with “New background job”.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1 px-1">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onCancel={() => cancelJob(job.id)}
                onApprove={() => approveJob(job.id)}
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
        'flex items-center gap-1 px-1.5 py-1 rounded text-[11px] cursor-pointer',
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

function JobCard({ job, onCancel, onApprove, onDiscard, onReview, onReport }) {
  const meta = STATUS_META[job.status] || STATUS_META.done;
  const lastLines = job.output.slice(-2);
  const changedCount = job.changedFiles.length;
  const isDone = job.status === 'done' || job.status === 'failed';

  return (
    <div className="rounded-sm border border-sidebar-border/60 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', job.status === 'running' && 'animate-pulse')}
          style={{ backgroundColor: meta.color, opacity: job.status === 'running' ? 1 : 0.5 }}
        />
        <span className="text-[11px] leading-tight line-clamp-2 break-words min-w-0 flex-1">{job.label}</span>
        {job.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
      </div>

      <div className="flex items-center gap-1.5 mt-0.5 ml-3 text-[9px] text-muted-foreground/60 uppercase tracking-wide">
        <span>{job.cli}</span>
        {job.useWorktree && <span>· worktree</span>}
      </div>

      {lastLines.length > 0 && (
        <div className="mt-1 ml-3 font-mono text-[9px] leading-tight text-muted-foreground/70">
          {lastLines.map((l, i) => (
            <div key={i} className={cn('truncate', l.stream === 'stderr' && 'text-destructive/80')}>
              {l.chunk || ' '}
            </div>
          ))}
        </div>
      )}

      {job.error && <div className="mt-1 ml-3 text-[9px] text-destructive/80 break-words">{job.error}</div>}

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {job.status === 'running' && (
          <JobBtn icon={Square} label="Cancel" onClick={onCancel} />
        )}
        {isDone && changedCount > 0 && (
          <JobBtn icon={GitCompare} label={`Review ${changedCount}`} onClick={onReview} />
        )}
        {job.reportPath && <JobBtn icon={FileText} label="Report" onClick={onReport} />}
        {isDone && job.worktreePath && changedCount > 0 && (
          <JobBtn icon={Check} label="Approve" onClick={onApprove} />
        )}
        {job.status !== 'running' && (
          <JobBtn
            icon={Trash2}
            label={job.worktreePath ? 'Discard' : 'Dismiss'}
            onClick={onDiscard}
            muted
          />
        )}
      </div>
    </div>
  );
}

function JobBtn({ icon: Icon, label, onClick, muted = false }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border border-sidebar-border/60 hover:bg-sidebar-accent cursor-pointer',
        muted && 'text-muted-foreground'
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </button>
  );
}
