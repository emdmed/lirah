import { useMemo, useRef } from 'react';
import { plural } from '../../lib/plural';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogGroup } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { DiffBar } from '../../components/instrument/DiffBar';
import { Fig31Subject } from './Fig31Subject';
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


// One line: `● stage ✦ ● message ✦ ● commit`. A step's lamp is lit while it
// runs, ok once done, fault where it failed.
function StepLine({ stage, failedAt }) {
  const current = stage === 'error' ? failedAt : stepIndex(stage);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-[11px]">
      {STEPS.map((step, i) => {
        // done | active | fault | pending
        let state = 'pending';
        if (i < current || stage === 'done') state = 'done';
        else if (i === current) state = stage === 'error' ? 'fault' : 'active';
        const busy = state === 'active' && stage !== 'ready';
        const lamp = { done: 'ok', active: 'on', fault: 'fault', pending: 'off' }[state];
        return (
          <li key={step.id} className="flex items-center gap-2" aria-current={state === 'active' ? 'step' : undefined}>
            {i > 0 && <span className="ins-sep-star" aria-hidden="true" />}
            <span className="flex items-center gap-1.5">
              <Lamp state={lamp} blink={busy} />
              <span
                className={cn(
                  state === 'pending' ? 'text-muted-foreground' : 'text-foreground',
                  state === 'fault' && 'text-[var(--ins-fault)]',
                )}
              >
                {step.label.toLowerCase()}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Added/removed line totals from a unified diff.
function diffTotals(diff) {
  let added = 0;
  let removed = 0;
  for (const line of (diff || '').split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line[0] === '+') added++;
    else if (line[0] === '-') removed++;
  }
  return { added, removed };
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
            {counts[code]} <span className="font-semibold" style={{ color }}>{code}</span>
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
            <span className="w-3 shrink-0 text-center font-semibold" style={{ color }}>{code}</span>
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

export function AutoCommitDialog({ autoCommit }) {
  const { stage, files, diff, commitMessage, setCommitMessage, error, confirm, cancel } = autoCommit;
  const isOpen = stage !== 'idle';
  const canCommit = stage === 'ready' && commitMessage.trim().length > 0;
  const showWork = files.length > 0 && stage !== 'done';
  const totals = useMemo(() => diffTotals(diff), [diff]);
  const subjectLength = commitMessage.split('\n')[0].length;

  // Remember the step we were on, so an error lights the step where it failed.
  const lastStepRef = useRef(0);
  if (stage !== 'error' && stage !== 'idle') lastStepRef.current = Math.max(0, stepIndex(stage));

  const working = stage === 'loading-files' || stage === 'generating-message' || stage === 'committing';
  const lamp = working ? 'blink' : stage === 'done' ? 'ok' : stage === 'error' ? 'fault' : 'on';
  const running = {
    'loading-files': 'scanning the repository',
    'generating-message': 'writing from the diff',
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
  const hints = stage === 'ready' || stage === 'generating-message'
    ? [{ keys: ['↵'], label: 'commit' }, { keys: ['⇧', '↵'], label: 'new line' }]
    : undefined;
  const settled = stage === 'done' || stage === 'error';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) cancel(); }}>
      <DialogContent
        size="lg"
        className="max-h-[85vh] flex flex-col gap-4 overflow-hidden"
        keys={['^', '⇧', '␣']}
        lamp={lamp}
        status={status}
        hints={hints}
        escLabel={settled ? 'close' : 'cancel'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && canCommit) {
            e.preventDefault();
            confirm(commitMessage);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
      >
        <DialogTitle>Auto commit</DialogTitle>
        <DialogDescription className="sr-only">
          Stage every change, generate a commit message, review it and commit.
        </DialogDescription>

        {/* Where we are, then what is about to be committed. */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <StepLine stage={stage} failedAt={lastStepRef.current} />
          {files.length > 0 ? (
            <span className="flex items-baseline gap-3 text-xs tabular-nums">
              <span className="text-foreground">{plural(files.length, 'file')}</span>
              {(totals.added > 0 || totals.removed > 0) && (
                <DiffBar added={totals.added} removed={totals.removed} side={64} className="self-center" />
              )}
              <StatusTally files={files} />
            </span>
          ) : stage !== 'loading-files' && (
            <span className="text-xs text-muted-foreground">No changes</span>
          )}
        </div>

        {/* Settled results are one line, not a box. */}
        {stage === 'done' && (
          <p className="flex min-w-0 items-center gap-2.5 text-sm" role="status">
            <Lamp state="ok" />
            <span className="shrink-0 text-foreground">Committed {plural(files.length, 'file')}</span>
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{commitMessage.split('\n')[0]}</span>
          </p>
        )}

        {stage === 'error' && (
          <div className="flex min-w-0 flex-col gap-1.5" role="alert">
            <p className="flex items-center gap-2.5 text-sm text-[var(--ins-fault)]">
              <Lamp state="fault" />
              {files.length === 0 ? 'Nothing to commit' : 'Commit failed'}
            </p>
            {error && (
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words pl-[17px] text-xs text-muted-foreground">
                {error}
              </pre>
            )}
          </div>
        )}

        {showWork && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {/* The message is what you review, so it leads. */}
            <section className="flex flex-col gap-2">
              <DialogGroup label={<label htmlFor="autocommit-message">Commit message</label>} />
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
                  placeholder="Summarise the change in one line, then add detail below…"
                  className="ins-well h-32 w-full resize-none px-3 py-2.5 text-xs leading-relaxed text-foreground outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1 disabled:opacity-60"
                  disabled={stage === 'committing'}
                  autoFocus
                />
              )}
              {stage !== 'generating-message' && (
                <Fig31Subject
                  subject={commitMessage.split('\n')[0]}
                  max={SUBJECT_MAX}
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
            <Button variant="ghost" size="sm" onClick={cancel} className="px-3 text-xs">
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancel}
                disabled={stage === 'committing'}
                className="px-3 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => confirm(commitMessage)}
                disabled={!canCommit}
                className="px-3 text-xs"
              >
                {stage === 'committing' ? 'Committing…' : `Commit ${plural(files.length, 'file')}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
