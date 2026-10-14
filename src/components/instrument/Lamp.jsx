import { cn } from '@/lib/utils';

// An indicator lamp. `off` is a dark lens; `on` uses the theme lamp colour,
// `ok`/`warn`/`fault` the ANSI-derived status colours.
export function Lamp({ state = 'off', blink = false, label, className }) {
  return (
    <span
      className={cn('ins-lamp ins-round', className)}
      data-state={state}
      data-blink={blink || undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

// Agent job status → lamp. `running` blinks.
export const JOB_LAMP = {
  running: { state: 'on', blink: true },
  done: { state: 'ok', blink: false },
  applied: { state: 'ok', blink: false },
  conflict: { state: 'warn', blink: false },
  interrupted: { state: 'warn', blink: false },
  failed: { state: 'fault', blink: false },
  cancelled: { state: 'off', blink: false },
};

export function jobLamp(status) {
  return JOB_LAMP[status] || JOB_LAMP.cancelled;
}
