import { cn } from '@/lib/utils';
import { Lamp } from './Lamp';

// A section tab: ink underline on the pane's rule when chosen. Counts stay
// quiet unless chosen or toned (waiting tabs); `flag` adds a warn mark.
export function TabButton({ active, onClick, label, icon: Icon, count, lamp = false, countTone, flag, controls = 'workspace-section', hint = '[ ] to switch sections' }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      title={`${flag ? `${flag} · ` : ''}${hint}`}
      className="ins-legend ins-tab flex items-center gap-1.5 px-1.5 pt-0.5 pb-2 cursor-pointer"
    >
      {lamp && <Lamp state="on" />}
      {Icon && <Icon size={12} />}
      {label}
      {count > 0 && (
        <span className={cn('tabular-nums', countTone || (active ? 'text-foreground' : 'text-muted-foreground/80'))}>{count}</span>
      )}
      {flag && (
        <span aria-label={flag} className="ins-tab-flag" />
      )}
    </button>
  );
}
