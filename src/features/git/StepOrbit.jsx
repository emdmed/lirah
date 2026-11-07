import { Fragment } from 'react';
import { ChunkBody } from '../plans/ChunkRow';
import { Lamp } from '../../components/instrument/Lamp';
import { cn } from '../../lib/utils';

// A git run's steps as bodies on one orbit line, like the plans' chunk spine
// laid flat: done is a filled body, the running step the gold sun, the step
// waiting on you a solid ring, later ones dashed rings. A step that failed
// shows its lamp in tone. The line is solid up to where work has reached.
//
// steps   [{ id, label }]
// states  one per step: 'done' | 'live' | 'next' | 'queued' | 'warn' | 'fault'
export function StepOrbit({ steps, states }) {
  return (
    <ol className="flex items-center gap-2 text-[11px]">
      {steps.map((step, i) => {
        const state = states[i];
        const reached = state !== 'queued';
        return (
          <Fragment key={step.id}>
            {i > 0 && (
              <li
                aria-hidden="true"
                className={cn('w-6 border-t border-[var(--ins-faint)]', !reached && 'border-dashed')}
              />
            )}
            <li
              className="flex h-[22px] items-center gap-1.5"
              aria-current={state === 'live' || state === 'next' ? 'step' : undefined}
            >
              {state === 'warn' || state === 'fault'
                ? <Lamp state={state} />
                : <ChunkBody body={state} label={`${step.label}: ${state}`} />}
              <span
                className={cn(
                  state === 'live' ? 'ins-name text-[13px] text-foreground' : reached ? 'text-foreground' : 'text-muted-foreground',
                  state === 'fault' && 'text-[var(--ins-fault)]',
                  state === 'warn' && 'text-[var(--ins-warn)]',
                )}
              >
                {step.label.toLowerCase()}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
