import { useRef } from 'react';
import { plural } from '../../lib/plural';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogGroup } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { cn } from '../../lib/utils';

// `git diff --name-status` letters, coloured like the auto-commit list.
const STATUS_COLOR = {
  M: 'var(--ins-warn)',
  A: 'var(--ins-ok)',
  D: 'var(--ins-fault)',
  R: 'var(--color-status-info)',
};

const STEPS = [
  { id: 'check', label: 'Check', stages: ['checking', 'ready'] },
  { id: 'merge', label: 'Merge', stages: ['merging', 'done'] },
];

const stepIndex = (stage) => STEPS.findIndex((s) => s.stages.includes(stage));


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
            {i > 0 && <span className="ins-sep-star" aria-hidden="true" />}
            <span className="flex items-center gap-1.5">
              <Lamp state={lamp} blink={blink} />
              <span className={active ? 'text-foreground' : 'text-muted-foreground'}>
                {step.label.toLowerCase()}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// The exact git commands confirm() will run, so nothing happens unseen.
function planCommands({ feature, base, plan }) {
  const where = plan.switchNeeded ? '' : `(in ${plan.mergeDir}) `;
  const cmds = [];
  if (plan.switchNeeded) cmds.push(`git switch ${base}`);
  cmds.push(plan.ff
    ? `${where}git merge --ff-only ${feature}`
    : `${where}git merge --no-ff -m "Merge branch '${feature}' into ${base}" ${feature}`);
  if (plan.featureWorktree) cmds.push(`git worktree remove ${plan.featureWorktree}`);
  return cmds;
}

// Errors are a summary, a blank line, then git's own output.
function splitError(error) {
  const text = String(error ?? '');
  const at = text.indexOf('\n\n');
  return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + 2).trim()];
}

export function AutoMergeDialog({ autoMerge }) {
  const { stage, feature, bases, base, setBase, plan, result, error, confirm, cancel } = autoMerge;
  const isOpen = stage !== 'idle';
  const nothingToMerge = plan && plan.commits.length === 0;
  const canMerge = stage === 'ready' && plan && !nothingToMerge;

  const lastStepRef = useRef(0);
  if (stage !== 'error' && stage !== 'idle') lastStepRef.current = Math.max(0, stepIndex(stage));

  const moveBase = (delta) => {
    const i = bases.indexOf(base);
    const next = bases[(i + delta + bases.length) % bases.length];
    if (next && next !== base) setBase(next);
  };

  const working = stage === 'checking' || stage === 'merging' || (stage === 'ready' && !plan);
  const lamp = working ? 'blink' : stage === 'done' ? 'ok' : stage === 'error' ? 'fault' : 'on';
  const running = stage === 'checking' ? 'checking the repository'
    : stage === 'merging' ? 'merging'
    : stage === 'ready' && !plan ? 'comparing branches' : null;
  const status = running ? (
    <>
      <Scanner label={running} />
      {running}
    </>
  ) : stage === 'ready' && plan && !nothingToMerge ? (
    <span style={{ color: plan.ff ? 'var(--ins-ok)' : 'var(--ins-warn)' }}>
      {plan.ff ? 'fast-forward' : 'merge commit'}
    </span>
  ) : null;
  const settled = stage === 'done' || stage === 'error';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) cancel(); }}>
      <DialogContent
        size="lg"
        className="max-h-[85vh] flex flex-col gap-4 overflow-hidden"
        keys={['alt', 'M']}
        lamp={lamp}
        status={status}
        hints={stage === 'ready' ? [{ keys: ['↑', '↓'], label: 'base' }, { keys: ['↵'], label: 'merge' }] : undefined}
        escLabel={settled ? 'close' : 'cancel'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canMerge) {
            e.preventDefault();
            confirm();
          } else if (stage === 'ready' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            moveBase(e.key === 'ArrowDown' ? 1 : -1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
      >
        <DialogTitle>Merge branch</DialogTitle>
        <DialogDescription className="sr-only">
          Switch to a base branch and merge the current feature branch into it.
        </DialogDescription>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <StepLine stage={stage} failedAt={lastStepRef.current} />
          {feature && (
            <span className="truncate text-xs">
              <span className="text-foreground">{feature}</span>
              <span className="text-muted-foreground"> → </span>
              <span className="text-[var(--ins-lamp)]">{base || '…'}</span>
            </span>
          )}
        </div>

        {stage === 'checking' && (
          <p className="text-xs text-muted-foreground">Checking repository state…</p>
        )}

        {/* Settled results are lines, not boxes. */}
        {stage === 'done' && result && (
          <div className="flex min-w-0 flex-col gap-0.5" role="status">
            <p className="flex items-center gap-2.5 text-sm text-foreground">
              <Lamp state="ok" />
              Merged {feature} into {base} {result.ff ? '(fast-forward)' : '(merge commit)'}
            </p>
            <p className="pl-[17px] text-xs text-muted-foreground">Now on {base}. Not pushed.</p>
            {result.notes.map((n) => (
              <p key={n} className="truncate pl-[17px] text-xs text-muted-foreground" title={n}>{n}</p>
            ))}
          </div>
        )}

        {stage === 'error' && (
          <div className="flex min-w-0 flex-col gap-1.5" role="alert">
            <p className="flex items-center gap-2.5 text-sm text-[var(--ins-fault)]">
              <Lamp state="fault" />
              Not merged
            </p>
            {error && (() => {
              const [summary, output] = splitError(error);
              return (
                <>
                  <p className="pl-[17px] text-xs text-foreground">{summary}</p>
                  {output && (
                    <pre className="max-h-48 select-text overflow-auto whitespace-pre-wrap break-words pl-[17px] text-xs text-muted-foreground">
                      {output}
                    </pre>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {(stage === 'ready' || stage === 'merging') && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <section className="flex flex-col gap-1">
              <DialogGroup label="Merge into" />
              <ul role="listbox" aria-label="Base branch" className="-mx-3 max-h-[18vh] overflow-y-auto">
                {bases.map((b) => (
                  <li key={b}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={b === base}
                      disabled={stage === 'merging'}
                      onClick={() => b !== base && setBase(b)}
                      className={cn(
                        'flex w-full items-center gap-2 py-[3px] pl-3.5 pr-3 text-left text-xs',
                        b === base
                          ? 'ins-row-selected text-foreground'
                          : 'text-muted-foreground hover:bg-[color-mix(in_srgb,var(--color-foreground)_5%,transparent)]',
                      )}
                    >
                      {b}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {!plan ? null : nothingToMerge ? (
              <p className="text-xs text-muted-foreground">
                {base} already contains every commit on {feature}. Nothing to merge.
              </p>
            ) : (
              <>
                <section className="flex min-h-0 flex-col gap-1">
                  <DialogGroup label={`${plural(plan.commits.length, 'commit')} · ${plural(plan.files.length, 'file')}`} />
                  <ul className="max-h-[16vh] overflow-y-auto">
                    {plan.commits.map((c) => (
                      <li key={c} className="truncate py-[2px] text-xs">
                        <span className="text-muted-foreground">{c.slice(0, c.indexOf(' '))}</span>
                        <span className="text-foreground">{c.slice(c.indexOf(' '))}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="max-h-[14vh] overflow-y-auto pt-1">
                    {plan.files.map((f) => (
                      <li key={f.path} className="flex items-baseline gap-3 py-[2px] text-xs">
                        <span className="w-3 shrink-0 text-center font-semibold" style={{ color: STATUS_COLOR[f.status] }}>
                          {f.status}
                        </span>
                        <span className="min-w-0 truncate text-muted-foreground">{f.path}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="flex flex-col gap-1.5">
                  <DialogGroup label="Will run" />
                  <pre className="ins-well overflow-x-auto px-3 py-2 text-xs leading-relaxed text-foreground">
                    {planCommands({ feature, base, plan }).join('\n')}
                  </pre>
                  {plan.standingInFeatureWorktree && (
                    <p className="text-[11px] text-muted-foreground">
                      This tab is inside the {feature} worktree, so the worktree is kept.
                    </p>
                  )}
                </section>
              </>
            )}
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
                disabled={stage === 'merging'}
                className="px-3 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={confirm}
                disabled={!canMerge}
                className="px-3 text-xs"
              >
                {stage === 'merging' ? 'Merging…' : 'Merge'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
