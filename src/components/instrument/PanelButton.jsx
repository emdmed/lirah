import { cn } from '@/lib/utils';
import { Lamp } from './Lamp';

// A push button on the chassis: raised face, travels 1px when pressed.
// Pass `latched` (boolean) to make it a latching switch: it stays down while
// on and carries a lamp that lights with it. Icon-only buttons are square.
export function PanelButton({ icon: Icon, children, latched, className, ref, ...props }) {
  const isLatch = latched !== undefined;
  return (
    <button
      ref={ref}
      type="button"
      className={cn('ins-key ins-key-panel ins-round', className)}
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
