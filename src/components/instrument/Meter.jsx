import { cn } from '@/lib/utils';
import { clamp01, gaugeLevel, WARN_AT } from './gauge';

function formatCompact(n) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${+(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

const TICKS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// A meter for a quantity with a ceiling: ticks every 10%, a 3px fill that
// turns warn at `warnAt` and fault at 95%, a hatched red zone, and a
// lamp-coloured needle. Readout uses tabular numerals; `readout={false}`
// drops it when the caller shows its own figure. `caution` forces the warn
// fill below `warnAt` (fault still wins at 95%). The red zone stays faint
// until the fill nears it. `size="lg"` is the status-bar gauge: a wider,
// taller scale that stays legible at low fill.
export function Meter({ value, max, warnAt = WARN_AT, label, format = formatCompact, size, readout = true, caution = false, className }) {
  const ratio = max > 0 ? clamp01(value / max) : 0;
  const level = gaugeLevel(ratio, warnAt, caution);
  const pct = `${(ratio * 100).toFixed(1)}%`;
  // The fill spans the scale and scales from its left edge, so it animates on
  // the compositor. The lg gauge keeps a 1% sliver so an empty context still reads.
  const fill = size === 'lg' ? Math.max(ratio, 0.01) : ratio;
  return (
    <span
      className={cn('ins-meter', className)}
      data-level={level}
      data-size={size}
      data-calm={ratio < warnAt - 0.2 || undefined}
      data-empty={ratio === 0 || undefined}
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span className="ins-meter-scale" aria-hidden="true">
        <span className="ins-meter-ticks">
          {TICKS.map((t) => (
            <span key={t} data-major={t % 50 === 0 || undefined} style={{ left: `${t}%` }} />
          ))}
        </span>
        <span className="ins-meter-track" />
        <span className="ins-meter-zone" style={{ left: `${warnAt * 100}%` }} />
        <span className="ins-meter-fill" style={{ transform: `scaleX(${fill})` }} />
        <span className="ins-meter-needle" style={{ left: pct }} />
      </span>
      {readout && (
        <span className="ins-meter-readout">
          {format(value)}<span className="ins-meter-max">/{format(max)}</span>
        </span>
      )}
    </span>
  );
}
