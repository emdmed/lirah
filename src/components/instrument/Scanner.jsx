import { cn } from '@/lib/utils';

// Busy indicator: a gold body stepping around a small tilted orbit. Use for
// any "working…" state in place of a spinner. `size` picks the orbit:
// sm (inline / buttons), md (status lines), lg (empty panes).
export function Scanner({ size = 'sm', label, className }) {
  return (
    <span
      className={cn('ins-scan', className)}
      data-size={size}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <i className="rounded-full" />
    </span>
  );
}
