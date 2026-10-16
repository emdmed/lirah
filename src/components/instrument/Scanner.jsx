import { cn } from '@/lib/utils';

const CELLS = 4;

// Busy indicator: a row of square lamp segments with a lit cell chasing across
// them in steps. Use for any "working…" state in place of a spinner. `size`
// picks the cell: sm (inline / buttons), md (status lines), lg (empty panes).
export function Scanner({ size = 'sm', label, className }) {
  return (
    <span
      className={cn('ins-scan', className)}
      data-size={size}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: CELLS }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
