import { useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Lamp } from '../../components/instrument/Lamp';
import { KeyChord } from '../../components/instrument/Keycap';
import { Scanner } from '../../components/instrument/Scanner';
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

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function StepLine({ stage, failedAt }) {
  const current = stage === 'error' ? failedAt : stepIndex(stage);
  return (
    <ol className="grid grid-cols-3 gap-1.5">
      {STEPS.map((step, i) => {
        // done | active | fault | pending
        let state = 'pending';
        if (i < current || stage === 'done') state = 'done';
        else if (i === current) state = stage === 'error' ? 'fault' : 'active';
        const busy = state === 'active' && stage !== 'ready';
        return (
          <li key={step.id} className="flex flex-col gap-1.5" aria-current={state === 'active' ? 'step' : undefined}>
            <span
              aria-hidden="true"
              className={cn(
                'h-[2px]',
                state === 'done' && 'bg-[var(--ins-ok)]',
                state === 'active' && 'bg-[var(--ins-lamp)]',
                state === 'fault' && 'bg-[var(--ins-fault)]',
                state === 'pending' && 'bg-[var(--ins-edge-strong)]',
                busy && 'ins-pulse',
              )}
            />
            <span className="flex items-center gap-1.5 text-[10px]">
              <span className="tabular-nums text-muted-foreground/70">0{i + 1}</span>
              <span
                className={cn(
                  'ins-legend text-[10px]',
                  state === 'pending' ? 'text-muted-foreground/70' : 'text-foreground',
                  state === 'fault' && 'text-[var(--ins-fault)]',
                )}
              >
                {step.label}
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) cancel(); }}>
      <DialogContent
        className="sm:max-w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col gap-5 overflow-hidden"
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

        {/* Summary: what is about to be committed, then where we are. */}
        <div className="flex shrink-0 flex-col gap-4 pt-2">
          <div className="flex items-end justify-between gap-4">
            {stage === 'loading-files' ? (
              <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Scanner label="Scanning" />
                Scanning repository…
              </span>
            ) : files.length > 0 ? (
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="text-sm text-foreground">{plural(files.length, 'file')}</span>
                {(totals.added > 0 || totals.removed > 0) && (
                  <span className="font-mono text-xs tabular-nums">
                    <span className="text-git-added">+{totals.added}</span>{' '}
                    <span className="text-git-deleted">−{totals.removed}</span>
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No changes</span>
            )}
            {files.length > 0 && <StatusTally files={files} />}
          </div>
          <StepLine stage={stage} failedAt={lastStepRef.current} />
        </div>

        {stage === 'done' && (
          <div className="flex items-start gap-3 edge-engraved px-4 py-3.5" role="status">
            <Lamp state="ok" className="mt-1" />
            <div className="min-w-0">
              <p className="text-sm text-foreground">Committed {plural(files.length, 'file')}</p>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{commitMessage.split('\n')[0]}</p>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="flex items-start gap-3 edge-engraved px-4 py-3.5" role="alert">
            <Lamp state="fault" className="mt-1" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--ins-fault)]">
                {files.length === 0 ? 'Nothing to commit' : 'Commit failed'}
              </p>
              <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {error}
              </pre>
            </div>
          </div>
        )}

        {showWork && (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
            {/* The message is what you review, so it leads. */}
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="autocommit-message" className="ins-legend text-[10px]">Commit message</label>
                {stage === 'generating-message' ? (
                  <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Scanner label="Generating" />
                    writing from the diff
                  </span>
                ) : (
                  <span
                    className={cn(
                      'text-[11px] tabular-nums',
                      subjectLength > SUBJECT_MAX ? 'text-[var(--ins-warn)]' : 'text-muted-foreground',
                    )}
                    title={`Keep the first line under ${SUBJECT_MAX} characters`}
                  >
                    subject {subjectLength}/{SUBJECT_MAX}
                  </span>
                )}
              </div>
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
            </section>

            <section className="flex min-h-0 flex-col gap-2">
              <span className="ins-legend text-[10px]">Staged changes</span>
              <div className="edge-engraved">
                <FileList files={files} className="max-h-[24vh]" />
              </div>
            </section>
          </div>
        )}

        <footer className="-mx-5 flex shrink-0 items-center justify-between gap-3 px-5 pt-4 edge-t-engraved">
          <span className="flex items-center gap-3 text-[11px]">
            {(stage === 'ready' || stage === 'generating-message') && (
              <>
                <KeyChord keys={['↵']} label="commit" size="sm" />
                <KeyChord keys={['⇧', '↵']} label="new line" size="sm" />
              </>
            )}
          </span>
          <div className="flex gap-2">
            {stage === 'done' || stage === 'error' ? (
              <Button variant="ghost" size="sm" onClick={cancel} className="min-w-[88px] px-3 text-xs">
                Close
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancel}
                  disabled={stage === 'committing'}
                  className="min-w-[88px] px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => confirm(commitMessage)}
                  disabled={!canCommit}
                  className="min-w-[120px] px-3 text-xs"
                >
                  {stage === 'committing' ? (
                    <>
                      <Scanner label="Committing" />
                      Committing
                    </>
                  ) : (
                    `Commit ${plural(files.length, 'file')}`
                  )}
                </Button>
              </>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
