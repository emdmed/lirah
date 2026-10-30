import { Paperclip } from 'lucide-react';
import { cn } from '../../lib/utils';
import { plural } from '../../lib/plural';
import { relativeTo } from './tabActivity';
import { RowAction } from './RowAction';

/** What the tab's agent did in its latest turn; open, the files it edited. */
export function TurnTrail({ turn, summary, root, open, onToggle, onAttach }) {
  return (
    <div className="flex min-w-0 flex-col pl-6 text-[11px] text-muted-foreground">
      <RowAction
        aria-expanded={!!open}
        onClick={onToggle}
        title={open ? 'Hide files' : 'Show the files it edited'}
        tabIndex={-1}
        className={cn(
          'min-w-0 truncate tabular-nums hover:text-[var(--ins-lamp)]',
          summary.running && 'text-[var(--ins-lamp)]',
        )}
      >
        {summary.running && 'now · '}{summary.text}
      </RowAction>
      {open && (
        <div className="flex min-w-0 flex-col gap-0.5 pt-1">
          {[...turn.edited].map((f) => (
            <span key={f} title={f} className="min-w-0 truncate font-mono text-foreground/80">
              {relativeTo(f, root)}
            </span>
          ))}
          {turn.edited.size > 0 ? (
            <RowAction
              tabIndex={-1}
              onClick={() => onAttach([...turn.edited])}
              title="Add these files to the current tab's prompt"
              className="flex items-center gap-1 self-start pt-0.5 hover:text-[var(--ins-lamp)]"
            >
              <Paperclip className="h-3 w-3" />
              attach {plural(turn.edited.size, 'file')} to prompt
            </RowAction>
          ) : (
            <span>no files edited</span>
          )}
        </div>
      )}
    </div>
  );
}
