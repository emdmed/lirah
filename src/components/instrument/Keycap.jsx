import { cn } from '@/lib/utils';

// A key printed as a keycap. `lit` marks the active/focused key, `down` shows
// it pressed. Use for every key hint; tooltips flatten <kbd> automatically.
export function Keycap({ children, lit = false, down = false, size, className, ...props }) {
  return (
    <kbd
      className={cn('ins-cap ins-round', className)}
      data-lit={lit || undefined}
      data-down={down || undefined}
      data-size={size}
      {...props}
    >
      {children}
    </kbd>
  );
}

// A chord of keycaps followed by an optional label: `^ ⇧ P  palette`.
export function KeyChord({ keys, label, lit = false, size, className }) {
  return (
    <span className={cn('inline-flex items-center gap-[3px] whitespace-nowrap', className)}>
      {keys.map((k, i) => (
        <Keycap key={i} lit={lit} size={size}>{k}</Keycap>
      ))}
      {label && <span className="ml-1 text-muted-foreground">{label}</span>}
    </span>
  );
}
