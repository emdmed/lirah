import { cn } from '@/lib/utils';

function formatCompact(n) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${+(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

// A meter for a quantity with a ceiling: ticks every 10%, a 3px fill that
// turns warn at `warnAt` and fault at 95%, a hatched red zone, and a
// lamp-coloured needle. Readout uses tabular numerals; `readout={false}`
// drops it when the caller shows its own figure. `caution` forces the warn
// fill below `warnAt` (fault still wins at 95%). The red zone stays faint
// until the fill nears it. `size="lg"` is the status-bar gauge: a wider,
// taller scale that stays legible at low fill.
export function Meter({ value, max, warnAt = 0.8, label, format = formatCompact, size, readout = true, caution = false, className }) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const level = ratio >= 0.95 ? 'fault' : ratio >= warnAt || caution ? 'warn' : 'ok';
  const pct = `${(ratio * 100).toFixed(1)}%`;
  return (
    <span
      className={cn('ins-meter', className)}
      data-level={level}
      data-size={size}
      data-calm={ratio < warnAt - 0.2 || undefined}
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span className="ins-meter-scale" aria-hidden="true">
        <span className="ins-meter-ticks" />
        <span className="ins-meter-track" />
        <span className="ins-meter-zone" style={{ left: `${warnAt * 100}%` }} />
        <span className="ins-meter-fill" style={{ width: pct }} />
        <span className="ins-meter-needle" style={{ left: pct }} />
      </span>
      {readout && (
        <span className="ins-meter-readout">
          {format(value)}/{format(max)}
        </span>
      )}
    </span>
  );
}
