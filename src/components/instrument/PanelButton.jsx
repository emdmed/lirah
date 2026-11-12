import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Lamp } from './Lamp';
import { Scanner } from './Scanner';

// A key on a pane: the panel size of the button recipe, ghost unless a
// `variant` says otherwise. Pass `latched` (boolean) to make it a latching
// switch: it stays down while on and carries a lamp that lights with it.
// Icon-only buttons are square. `busy` disables it and swaps the icon for a scanner.
export function PanelButton({ icon: Icon, children, latched, busy = false, disabled, variant = 'ghost', className, ref, ...props }) {
  const isLatch = latched !== undefined;
  return (
    <button
      ref={ref}
      type="button"
      className={cn(buttonVariants({ variant, size: children ? 'panel' : 'icon-panel' }), className)}
      data-latched={latched || undefined}
      data-icon-only={!children || undefined}
      aria-pressed={isLatch ? latched : undefined}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {isLatch && <Lamp state={latched ? 'on' : 'off'} />}
      {busy ? <Scanner size="sm" /> : Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </button>
  );
}
