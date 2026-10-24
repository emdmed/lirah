import { useState } from 'react';
import { cn } from '../../lib/utils';
import { AUTOPILOT_STATUS, CHUNK_STATUS } from './planModel';

// Small presentational pieces of the plans pane.

export function EmptyLine({ children, hint }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2 text-[11px]">
      <div className="text-foreground">
        <span className="text-muted-foreground">-- </span>
        {children}
        <span className="text-muted-foreground"> --</span>
      </div>
      {hint && <div className="leading-relaxed text-muted-foreground"># {hint}</div>}
    </div>
  );
}

// Agent-written prose: `code` spans read brighter, and long text folds to a
// few lines behind a [more] toggle so one chunk can't fill the pane.
const CLAMP = { 3: 'line-clamp-3', 4: 'line-clamp-4' };

export function Prose({ text, clamp, className }) {
  const [full, setFull] = useState(false);
  const long = clamp && (text.length > clamp * 70 || text.split('\n').length > clamp);
  const parts = text.split(/`([^`\n]+)`/);
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      {/* wrap-anywhere (not break-words) lets long paths and identifiers shrink
          the min-content width, so they wrap instead of widening the pane. */}
      <p
        className={cn('whitespace-pre-wrap wrap-anywhere', long && !full && CLAMP[clamp])}
      >
        {parts.map((part, i) =>
          i % 2 ? <code key={i} className="text-foreground">{part}</code> : part
        )}
      </p>
      {long && (
        <button
          onClick={() => setFull((v) => !v)}
          className="tui-btn self-start text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
          aria-expanded={full}
        >
          {full ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="engraved-label">{label}</span>
      {children}
    </div>
  );
}

// One cell per chunk, coloured by its state, so progress also shows where the
// plan stands: what's in, what's in flight, what was rolled back. (Meter would
// read a finished plan as a fault.)
const CELL = {
  [CHUNK_STATUS.IMPLEMENTED]: 'bg-[var(--ins-ok)]',
  [CHUNK_STATUS.IN_PROGRESS]: 'bg-[var(--ins-lamp)]',
  [CHUNK_STATUS.ROLLED_BACK]: 'bg-[var(--ins-warn)]',
  [CHUNK_STATUS.PENDING]: 'bg-[var(--ins-lamp-off)]',
  [CHUNK_STATUS.SKIPPED]: 'shadow-[inset_0_0_0_1px_var(--ins-edge)]',
};

export function ProgressReadout({ plan, done, total }) {
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${done} of ${total} chunks implemented`}>
      {/* Sized by its cells (24px each, shrinking when many) so the count
          sits right after the bar instead of across the row. */}
      <div className="flex h-1.5 min-w-0 gap-px">
        {plan.chunks.map((c) => (
          <span key={c.id} className={cn('w-6 min-w-px', CELL[c.status] || CELL[CHUNK_STATUS.PENDING])} />
        ))}
      </div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        <span className={done > 0 ? 'text-foreground' : undefined}>{done}</span>/{total}
      </span>
    </div>
  );
}

// The lamp for each auto-pilot status, in the pane and the status bar.
export const AUTOPILOT_LAMP = {
  [AUTOPILOT_STATUS.RUNNING]: { state: 'on', blink: true },
  [AUTOPILOT_STATUS.PAUSED]: { state: 'warn' },
  [AUTOPILOT_STATUS.FAILED]: { state: 'fault' },
  [AUTOPILOT_STATUS.DONE]: { state: 'ok' },
  [AUTOPILOT_STATUS.OFF]: { state: 'off' },
};
