import { useRef } from 'react';
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
    <ol className="flex items-center gap-2 text-[11px]">
      {STEPS.map((step, i) => {
        let lamp = 'off';
        let blink = false;
        if (i < current || stage === 'done') lamp = 'ok';
        else if (i === current) {
          if (stage === 'error') lamp = 'fault';
          else if (stage === 'ready') lamp = 'on';
          else { lamp = 'on'; blink = true; }
        }
        const active = i === current && stage !== 'done';
        return (
          <li key={step.id} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true" className="h-px w-5 bg-[var(--ins-edge-strong)]" />}
            <span className="flex items-center gap-1.5">
              <Lamp state={lamp} blink={blink} />
              <span className={cn('ins-legend text-[10px]', active ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

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
            className="flex items-baseline gap-3 px-3 py-[3px] text-xs hover:bg-[color-mix(in_srgb,var(--color-foreground)_5%,transparent)]"
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
  const { stage, files, commitMessage, setCommitMessage, error, confirm, cancel } = autoCommit;
  const isOpen = stage !== 'idle';
  const canCommit = stage === 'ready' && commitMessage.trim().length > 0;
  const showWork = files.length > 0 && stage !== 'done';

  // Remember the step we were on, so an error lights the lamp where it failed.
  const lastStepRef = useRef(0);
  if (stage !== 'error' && stage !== 'idle') lastStepRef.current = Math.max(0, stepIndex(stage));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) cancel(); }}>
      <DialogContent
        className="sm:max-w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col gap-4 overflow-hidden"
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

        <div className="flex shrink-0 items-center justify-between gap-3 pt-1">
          <StepLine stage={stage} failedAt={lastStepRef.current} />
          {stage === 'loading-files' && (
            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Scanner label="Scanning" />
              scanning repository
            </span>
          )}
        </div>

        {stage === 'done' && (
          <div className="flex items-start gap-3 edge-engraved px-3 py-3" role="status">
            <Lamp state="ok" className="mt-1" />
            <div className="min-w-0">
              <p className="text-sm text-foreground">Committed {plural(files.length, 'file')}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{commitMessage.split('\n')[0]}</p>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="flex items-start gap-3 edge-engraved px-3 py-3" role="alert">
            <Lamp state="fault" className="mt-1" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--ins-fault)]">
                {files.length === 0 ? 'Nothing to commit' : 'Commit failed'}
              </p>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {error}
              </pre>
            </div>
          </div>
        )}

        {showWork && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <section className="flex min-h-0 flex-col edge-engraved">
              <header className="flex items-center justify-between gap-3 px-3 py-2 edge-b-engraved">
                <span className="ins-legend text-[10px]">Changes · {files.length}</span>
                <StatusTally files={files} />
              </header>
              <FileList files={files} className="max-h-[28vh]" />
            </section>

            <section className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="autocommit-message" className="ins-legend text-[10px]">Commit message</label>
                {stage !== 'generating-message' && (
                  <span className="tube-idle text-[11px]">{commitMessage.length} chars</span>
                )}
              </div>
              {stage === 'generating-message' ? (
                <div className="ins-well flex h-24 items-center justify-center gap-2.5 text-xs text-muted-foreground">
                  <Scanner size="md" label="Generating" />
                  writing message from the diff…
                </div>
              ) : (
                <textarea
                  id="autocommit-message"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Describe the changes..."
                  className="ins-well h-24 w-full resize-none px-3 py-2 text-xs leading-relaxed text-foreground outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1 disabled:opacity-60"
                  disabled={stage === 'committing'}
                  autoFocus
                />
              )}
            </section>
          </div>
        )}

        <footer className="flex shrink-0 items-center justify-between gap-3 pt-1">
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
                  className="min-w-[96px] px-3 text-xs"
                >
                  {stage === 'committing' ? (
                    <>
                      <Scanner label="Committing" />
                      Committing
                    </>
                  ) : (
                    'Commit'
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
