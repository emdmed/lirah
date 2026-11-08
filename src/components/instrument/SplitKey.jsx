import { NavArrowDown } from 'iconoir-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

// A primary action and its chooser as one split primary key: act now, or pick
// who or what acts. The left key runs `onClick`; the chevron runs `onChoose`
// (open a picker or menu).
export function SplitKey({ children, onClick, onChoose, chooseLabel, className, ...props }) {
  return (
    <span className={cn('ins-split ins-round', className)}>
      <button type="button" onClick={onClick} className={buttonVariants({ variant: 'default', size: 'panel' })} {...props}>
        {children}
      </button>
      <button
        type="button"
        onClick={onChoose}
        aria-label={chooseLabel}
        title={chooseLabel}
        aria-haspopup="dialog"
        className={buttonVariants({ variant: 'default', size: 'icon-panel' })}
        data-icon-only
      >
        <NavArrowDown aria-hidden="true" />
      </button>
    </span>
  );
}
