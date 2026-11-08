import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Lamp } from './Lamp';

// A key on a pane: the panel size of the button recipe, ghost unless a
// `variant` says otherwise. Pass `latched` (boolean) to make it a latching
// switch: it stays down while on and carries a lamp that lights with it.
// Icon-only buttons are square.
export function PanelButton({ icon: Icon, children, latched, variant = 'ghost', className, ref, ...props }) {
  const isLatch = latched !== undefined;
  return (
    <button
      ref={ref}
      type="button"
      className={cn(buttonVariants({ variant, size: children ? 'panel' : 'icon-panel' }), className)}
      data-latched={latched || undefined}
      data-icon-only={!children || undefined}
      aria-pressed={isLatch ? latched : undefined}
      {...props}
    >
      {isLatch && <Lamp state={latched ? 'on' : 'off'} />}
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </button>
  );
}
