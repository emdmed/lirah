import { cn } from '@/lib/utils';
import { clamp01, gaugeLevel, WARN_AT } from './gauge';

const R = 6;

// A context-window fill as a moon phase: new when empty, waxing to full at the
// ceiling. The lit part takes the legend colour, then warn at `warnAt` and
// fault at 95%, like Meter. For compact rows where a full Meter won't fit.
export function ContextMoon({ ratio, warnAt = WARN_AT, size = 12, className }) {
  const f = clamp01(ratio);
  const level = gaugeLevel(f, warnAt);
  // Right half of the disc, closed by the terminator: an ellipse that bulges
  // right (a crescent) below half and left (gibbous) above it.
  const rx = (Math.abs(1 - 2 * f) * R).toFixed(2);
  const lit = f >= 0.999
    ? <circle className="ins-moon-lit" cx="7" cy="7" r={R} />
    : <path className="ins-moon-lit" d={`M7 1A${R} ${R} 0 0 1 7 13A${rx} ${R} 0 0 ${f < 0.5 ? 0 : 1} 7 1Z`} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={cn('ins-moon', className)}
      data-level={level}
      role="img"
      aria-label={`Context ${Math.round(f * 100)}% full`}
    >
      <circle className="ins-moon-disc" cx="7" cy="7" r={R} />
      {f > 0.01 && lit}
    </svg>
  );
}
