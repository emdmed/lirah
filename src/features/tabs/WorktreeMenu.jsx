import { useRef } from 'react';
import { Branch, Compare, Merge, Trash } from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { plural } from '../../lib/plural';
import { RowAction } from './RowAction';
import { basename } from '../../utils/pathUtils';

/**
 * The repo's other worktrees as a printed count on the row; its menu reviews
 * one's changes in the diff viewer, merges it (the tab's merge dialog) or deletes it. Nothing when there are none.
 * `open` and `onOpenChange` let the pane open it from the keyboard (w on a row).
 */
export function WorktreeMenu({ tab, worktrees, open, onOpenChange, onReview, onMerge, onDelete }) {
  const wrapRef = useRef(null);
  if (!worktrees?.length) return null;
  return (
    // Portalled menu clicks still bubble through React to the row.
    <span ref={wrapRef} className="contents" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <RowAction
            tabIndex={-1}
            title={`${plural(worktrees.length, 'other worktree')} of this repo (w)`}
            className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] tabular-nums text-muted-foreground hover:text-[var(--ins-lamp)] data-[state=open]:text-[var(--ins-lamp)]"
          >
            <Branch size={12} />{worktrees.length}
          </RowAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="text-xs"
          // The trigger is aria-hidden (RowAction), so focus goes back to the row.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            wrapRef.current?.closest('[data-tab-row]')?.focus();
          }}
        >
          <DropdownMenuLabel>Worktrees</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {worktrees.map((w) => (
            <DropdownMenuSub key={w.path}>
              <DropdownMenuSubTrigger title={w.path} className="font-mono">
                {w.branch ?? `${basename(w.path)} (detached)`}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="text-xs">
                <DropdownMenuItem onSelect={() => onReview(tab.id, w)}>
                  <Compare size={12} />Review changes
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!w.branch} onSelect={() => onMerge(tab.id, w)}>
                  <Merge size={12} />Merge…
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => onDelete(tab, w)}>
                  <Trash size={12} />Delete worktree
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
