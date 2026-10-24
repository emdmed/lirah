import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// A primary action and its chooser under one lamp hairline: act now, or pick
// who or what acts. The left key runs `onClick`; the chevron runs `onChoose`
// (open a picker or menu).
export function SplitKey({ children, onClick, onChoose, chooseLabel, className, ...props }) {
  return (
    <span className={cn('ins-split ins-round', className)}>
      <button type="button" onClick={onClick} className="ins-key ins-key-panel" {...props}>
        {children}
      </button>
      <button
        type="button"
        onClick={onChoose}
        aria-label={chooseLabel}
        title={chooseLabel}
        aria-haspopup="dialog"
        className="ins-key ins-key-panel"
        data-icon-only
      >
        <ChevronDown aria-hidden="true" />
      </button>
    </span>
  );
}
