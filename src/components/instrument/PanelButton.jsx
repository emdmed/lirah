import { cn } from '@/lib/utils';
import { Lamp } from './Lamp';

// A push button on the chassis: raised face, travels 1px when pressed.
// Pass `latched` (boolean) to make it a latching switch: it stays down while
// on and carries a lamp that lights with it. Icon-only buttons are square.
// A labelled button prints as an italic verb, unless it's the primary key.
export function PanelButton({ icon: Icon, children, latched, className, ref, ...props }) {
  const isLatch = latched !== undefined;
  const verb = children && !String(className ?? '').includes('ins-key-primary');
  return (
    <button
      ref={ref}
      type="button"
      className={cn('ins-key ins-key-panel ins-round', verb && 'ins-key-verb ins-name', className)}
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
