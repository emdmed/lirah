import { useRef } from 'react';
import { plural } from '../../lib/plural';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Lamp } from '../../components/instrument/Lamp';
import { KeyChord } from '../../components/instrument/Keycap';
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) cancel(); }}>
      <DialogContent
        className="sm:max-w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col gap-4 overflow-hidden"
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

        <div className="flex shrink-0 items-center justify-between gap-3 pt-1">
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
          <div className="ins-well flex h-20 items-center justify-center gap-2.5 text-xs text-muted-foreground">
            <Scanner size="md" label="Checking" />
            checking repository state…
          </div>
        )}

        {stage === 'done' && result && (
          <div className="flex items-start gap-3 edge-engraved px-3 py-3" role="status">
            <Lamp state="ok" className="mt-1" />
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                Merged {feature} into {base} {result.ff ? '(fast-forward)' : '(merge commit)'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Now on {base}. Not pushed.</p>
              {result.notes.map((n) => (
                <p key={n} className="mt-0.5 truncate text-xs text-muted-foreground" title={n}>{n}</p>
              ))}
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="flex items-start gap-3 edge-engraved px-3 py-3" role="alert">
            <Lamp state="fault" className="mt-1" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--ins-fault)]">Not merged</p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {error}
              </pre>
            </div>
          </div>
        )}

        {(stage === 'ready' || stage === 'merging') && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <section className="flex flex-col edge-engraved">
              <header className="px-3 py-2 edge-b-engraved">
                <span className="ins-legend text-[10px]">Merge into</span>
              </header>
              <ul role="listbox" aria-label="Base branch" className="max-h-[18vh] overflow-y-auto py-1">
                {bases.map((b) => (
                  <li key={b}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={b === base}
                      disabled={stage === 'merging'}
                      onClick={() => b !== base && setBase(b)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-[3px] text-left text-xs',
                        b === base
                          ? 'bg-[color-mix(in_srgb,var(--ins-lamp)_14%,transparent)] text-foreground'
                          : 'text-muted-foreground hover:bg-[color-mix(in_srgb,var(--color-foreground)_5%,transparent)]',
                      )}
                    >
                      <Lamp state={b === base ? 'on' : 'off'} />
                      {b}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {!plan ? (
              <div className="ins-well flex h-16 items-center justify-center gap-2.5 text-xs text-muted-foreground">
                <Scanner label="Planning" />
                comparing branches…
              </div>
            ) : nothingToMerge ? (
              <p className="edge-engraved px-3 py-3 text-xs text-muted-foreground">
                {base} already contains every commit on {feature}. Nothing to merge.
              </p>
            ) : (
              <>
                <section className="flex min-h-0 flex-col edge-engraved">
                  <header className="flex items-center justify-between gap-3 px-3 py-2 edge-b-engraved">
                    <span className="ins-legend text-[10px]">
                      {plural(plan.commits.length, 'commit')} · {plural(plan.files.length, 'file')}
                    </span>
                    <span className="text-[11px]" style={{ color: plan.ff ? 'var(--ins-ok)' : 'var(--ins-warn)' }}>
                      {plan.ff ? 'fast-forward' : 'merge commit'}
                    </span>
                  </header>
                  <ul className="max-h-[16vh] overflow-y-auto py-1">
                    {plan.commits.map((c) => (
                      <li key={c} className="truncate px-3 py-[2px] text-xs">
                        <span className="text-muted-foreground">{c.slice(0, c.indexOf(' '))}</span>
                        <span className="text-foreground">{c.slice(c.indexOf(' '))}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="max-h-[14vh] overflow-y-auto py-1 edge-t-engraved">
                    {plan.files.map((f) => (
                      <li key={f.path} className="flex items-baseline gap-3 px-3 py-[2px] text-xs">
                        <span className="w-3 shrink-0 text-center font-semibold" style={{ color: STATUS_COLOR[f.status] }}>
                          {f.status}
                        </span>
                        <span className="min-w-0 truncate text-muted-foreground">{f.path}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="flex flex-col gap-1.5">
                  <span className="ins-legend text-[10px]">Will run</span>
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

        <footer className="flex shrink-0 items-center justify-between gap-3 pt-1">
          <span className="flex items-center gap-3 text-[11px]">
            {stage === 'ready' && (
              <>
                <KeyChord keys={['↵']} label="merge" size="sm" />
                <KeyChord keys={['↑', '↓']} label="base" size="sm" />
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
                  disabled={stage === 'merging'}
                  className="px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={confirm}
                  disabled={!canMerge}
                  className="min-w-[96px] px-3 text-xs"
                >
                  {stage === 'merging' ? (
                    <>
                      <Scanner label="Merging" />
                      Merging
                    </>
                  ) : (
                    'Merge'
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
