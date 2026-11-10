import { plural } from '../../lib/plural';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogGroup } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { DiffBar } from '../../components/instrument/DiffBar';
import { Fig33Log } from './Fig33Log';
import { StepOrbit } from './StepOrbit';
import { cn } from '../../lib/utils';

// `git status -s` style: one letter per file, coloured by kind.
const STATUS = {
  modified: { code: 'M', color: 'var(--ins-warn)' },
  added: { code: 'A', color: 'var(--ins-ok)' },
  deleted: { code: 'D', color: 'var(--ins-fault)' },
  renamed: { code: 'R', color: 'var(--color-status-info)' },
  untracked: { code: '?', color: 'var(--color-muted-foreground)' },
};

const statusOf = (s) => STATUS[s] || STATUS.untracked;

// The three steps the hook walks through, in order.
const STEPS = [
  { id: 'scan', label: 'Stage', stages: ['loading-files'] },
  { id: 'message', label: 'Message', stages: ['generating-message', 'ready'] },
  { id: 'commit', label: 'Commit', stages: ['committing', 'done'] },
];

const stepIndex = (stage) => STEPS.findIndex((s) => s.stages.includes(stage));


// A clean tree is not a failure: nothing lights. Back in review after a
// failure, the step that failed shows its lamp.
function stepStates(stage, failedAt, clean) {
  if (stage === 'error') return clean ? ['queued', 'queued', 'queued'] : ['fault', 'queued', 'queued'];
  if (stage === 'done') return ['done', 'done', 'done'];
  const current = stepIndex(stage);
  const states = STEPS.map((_, i) => (i < current ? 'done' : i === current ? (stage === 'ready' ? 'next' : 'live') : 'queued'));
  if (stage === 'ready' && failedAt === 'commit') states[2] = 'fault';
  if (stage === 'ready' && failedAt === 'message') states[1] = 'warn';
  return states;
}

// Git's conventional subject-line limit.
const SUBJECT_MAX = 72;

// Per-kind tallies for the list header: `12 M  2 A  1 D`.
function StatusTally({ files }) {
  const counts = {};
  for (const f of files) {
    const { code } = statusOf(f.status);
    counts[code] = (counts[code] || 0) + 1;
  }
  return (
    <span className="flex items-center gap-2.5 text-[11px] tabular-nums">
      {Object.values(STATUS)
        .filter(({ code }) => counts[code])
        .map(({ code, color }) => (
          <span key={code} className="text-muted-foreground">
            {counts[code]} <span style={{ color }}>{code}</span>
          </span>
        ))}
    </span>
  );
}

function FileList({ files, className }) {
  return (
    <ul className={cn('overflow-y-auto py-1', className)}>
      {files.map((f) => {
        const { code, color } = statusOf(f.status);
        const slash = f.path.lastIndexOf('/');
        const dir = slash >= 0 ? f.path.slice(0, slash + 1) : '';
        const base = slash >= 0 ? f.path.slice(slash + 1) : f.path;
        return (
          <li
            key={f.path}
            className="flex items-baseline gap-3 px-3 py-1 text-xs hover:bg-[color-mix(in_srgb,var(--color-foreground)_5%,transparent)]"
            title={`${f.status} — ${f.path}`}
          >
            <span className="w-3 shrink-0 text-center" style={{ color }}>{code}</span>
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">{dir}</span>
              <span className="text-foreground">{base}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// A failure as one line in its tone, with git's own words dimmed below it.
function FailureLine({ title, error, tone = 'fault' }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" role="alert">
      <p className="flex items-center gap-2.5 text-xs" style={{ color: `var(--ins-${tone})` }}>
        <Lamp state={tone} />
        {title}
      </p>
      {error && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words pl-[17px] text-[11px] leading-relaxed text-muted-foreground">
          {error.trim()}
        </pre>
      )}
    </div>
  );
}

export function AutoCommitDialog({ autoCommit }) {
  const {
    stage, hidden, hide, files, totals, log, commitMessage, setCommitMessage,
    error, failedAt, hash, queued, confirm, cancel, quickCommit,
  } = autoCommit;
  const isOpen = stage !== 'idle' && !hidden;
  // While it stages, writes or waits for review, closing only hides the
  // dialog: the run carries on in the tab row and the status bar brings it back.
  const backgroundable = stage === 'loading-files' || stage === 'generating-message' || stage === 'ready';
  const dismiss = () => {
    if (backgroundable) hide();
    else if (stage !== 'committing') cancel();
  };
  const canCommit = stage === 'ready' && commitMessage.trim().length > 0;
  // Before the message is ready, Enter queues the commit for when it is.
  const canQueue = (stage === 'loading-files' || stage === 'generating-message') && !queued;
  const showWork = files.length > 0 && stage !== 'done';
  const subjectLength = commitMessage.split('\n')[0].length;
  const nothingToCommit = stage === 'error' && files.length === 0 && !error;
  const retry = stage === 'ready' && failedAt === 'commit';

  const working = stage === 'loading-files' || stage === 'generating-message' || stage === 'committing';
  const lamp = working ? 'blink'
    : stage === 'done' ? 'ok'
    : nothingToCommit ? null
    : stage === 'error' || retry ? 'fault'
    : 'on';
  const running = {
    'loading-files': queued ? 'staging, commits when ready' : 'staging the changes',
    'generating-message': queued ? 'writing, commits when ready' : 'writing from the diff',
    committing: 'committing',
  }[stage];
  const status = running ? (
    <>
      <Scanner label={running} />
      {running}
    </>
  ) : stage === 'ready' ? (
    <span className={cn('tabular-nums', subjectLength > SUBJECT_MAX && 'text-[var(--ins-warn)]')}>
      subject {subjectLength}/{SUBJECT_MAX}
    </span>
  ) : null;
  const hints = stage === 'ready'
    ? [{ keys: ['↵'], label: retry ? 'retry' : 'commit' }, { keys: ['⇧', '↵'], label: 'new line' }]
    : canQueue
      ? [{ keys: ['↵'], label: 'commit when ready' }]
      : undefined;
  const settled = stage === 'done' || stage === 'error';
  const escLabel = backgroundable ? 'hide' : settled ? 'close' : 'cancel';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent
        size="lg"
        fig="33"
        className="max-h-[85vh] flex flex-col gap-4"
        keys={['^', '⇧', '␣']}
        lamp={lamp}
        status={status}
        hints={hints}
        escLabel={escLabel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && (canCommit || canQueue)) {
            e.preventDefault();
            if (canCommit) confirm(commitMessage);
            else quickCommit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            dismiss();
          }
        }}
      >
        <DialogTitle>Auto commit</DialogTitle>
        <DialogDescription className="sr-only">
          Stage every change, generate a commit message, review it and commit.
        </DialogDescription>

        {/* Where we are, then what is about to be committed. */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <StepOrbit steps={STEPS} states={stepStates(stage, failedAt, nothingToCommit)} />
          {files.length > 0 ? (
            <span className="flex items-baseline gap-3 text-xs tabular-nums">
              <span className="text-foreground">{plural(files.length, 'file')}</span>
              {(totals.added > 0 || totals.removed > 0) && (
                <DiffBar added={totals.added} removed={totals.removed} side={64} className="self-center" />
              )}
              <StatusTally files={files} />
            </span>
          ) : null}
        </div>

        {/* Settled results are one line, not a box. */}
        {stage === 'done' && (
          <p className="flex min-w-0 items-center gap-2.5 text-sm" role="status">
            <Lamp state="ok" />
            <span className="shrink-0 text-foreground">Committed {plural(files.length, 'file')}</span>
            {hash && <span className="shrink-0 text-xs tabular-nums text-[var(--ins-lamp)]">{hash}</span>}
            <span className="min-w-0 truncate text-xs text-muted-foreground">{commitMessage.split('\n')[0]}</span>
          </p>
        )}

        {/* Nothing changed is a quiet line, not a fault. */}
        {nothingToCommit && (
          <p className="flex items-center gap-2.5 text-sm text-muted-foreground" role="status">
            <Lamp state="off" />
            Nothing to commit: the working tree is clean.
          </p>
        )}

        {stage === 'error' && !nothingToCommit && (
          <FailureLine title="Couldn't stage the changes" error={error} />
        )}

        {showWork && (
          <div className="-mx-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3">
            {/* The message is what you review, so it leads. */}
            <section className="flex flex-col gap-2">
              <DialogGroup label={<label htmlFor="autocommit-message">Commit message</label>} />
              {retry && (
                <FailureLine title="Git rejected the commit. Fix it and retry; the message is kept." error={error} />
              )}
              {stage === 'ready' && failedAt === 'message' && (
                <FailureLine tone="warn" title="Couldn't write a message. Write one below." error={error} />
              )}
              {stage === 'generating-message' ? (
                <div className="ins-well flex h-32 flex-col gap-2.5 px-3 py-3" aria-hidden="true">
                  <span className="ins-pulse h-2 w-3/5 bg-foreground/10" />
                  <span className="h-2 w-0" />
                  <span className="ins-pulse h-2 w-11/12 bg-foreground/[0.07]" />
                  <span className="ins-pulse h-2 w-4/5 bg-foreground/[0.07]" />
                  <span className="ins-pulse h-2 w-2/3 bg-foreground/[0.07]" />
                </div>
              ) : (
                <textarea
                  id="autocommit-message"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Summarise the change in one line, a blank line, then detail…"
                  className="ins-well h-32 w-full resize-none px-3 py-2.5 text-xs leading-relaxed text-foreground outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1 disabled:opacity-60"
                  disabled={stage === 'committing'}
                  aria-invalid={retry || undefined}
                  autoFocus
                />
              )}
              {stage !== 'generating-message' && (
                <Fig33Log
                  subject={commitMessage.split('\n')[0]}
                  max={SUBJECT_MAX}
                  commits={log.commits}
                  branch={log.branch}
                  fallback={(
                    <span className="text-[11px] text-muted-foreground">
                      Keep the first line under {SUBJECT_MAX} characters
                    </span>
                  )}
                />
              )}
            </section>

            <section className="flex min-h-0 flex-col gap-1">
              <DialogGroup label="Staged changes" />
              <FileList files={files} className="-mx-3 max-h-[24vh]" />
            </section>
          </div>
        )}

        <DialogFooter className="shrink-0">
          {settled ? (
            <Button variant="outline" size="sm" onClick={cancel}>
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={cancel}
                disabled={stage === 'committing'}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => (canCommit ? confirm(commitMessage) : quickCommit())}
                disabled={!canCommit && !canQueue}
              >
                {stage === 'committing' ? 'Committing…'
                  : queued ? 'Commits when ready'
                  : canQueue ? 'Commit when ready'
                  : retry ? 'Retry commit'
                  : `Commit ${plural(files.length, 'file')}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
