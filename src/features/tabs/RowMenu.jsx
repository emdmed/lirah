import { useRef } from 'react';
import { Close, Folder, Link, More } from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { RoleItems } from './RoleMenu';
import { RowAction } from './RowAction';

// Set at the row's own size (11px type, 12px icons), not the menu default.
// Every label starts at 28px, icon or not, so the column reads straight down.
const ITEM = 'gap-2 py-1 text-[11px] [&_svg]:size-3';
const RADIO = 'py-1 pl-7 text-[11px]';

/**
 * The row's less used actions behind one button: role (until the tab has one,
 * then its chip changes it), link, folder, close. `open` and `onOpenChange` let
 * the pane open it from the keyboard (t on a row with no role).
 */
export function RowMenu({ tab, name, active, linked, closable, open, onOpenChange, actions }) {
  const wrapRef = useRef(null);
  return (
    // Portalled menu clicks still bubble through React to the row.
    <span ref={wrapRef} className="contents" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <RowAction
            tabIndex={-1}
            title="More actions"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-[var(--ins-lamp)] data-[state=open]:text-[var(--ins-lamp)]"
          >
            <More size={12} />
          </RowAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          // The trigger is aria-hidden (RowAction), so focus goes back to the row.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            wrapRef.current?.closest('[data-tab-row]')?.focus();
          }}
        >
          {!tab.role && (
            <>
              <DropdownMenuLabel className="flex items-center pt-1">
                Role<DropdownMenuShortcut keys={['t']} />
              </DropdownMenuLabel>
              <RoleItems tab={tab} className={RADIO} />
              <DropdownMenuSeparator />
            </>
          )}
          {!active && !linked && (
            <DropdownMenuItem className={ITEM} onSelect={() => actions.toggleLink(tab, name, linked)}>
              <Link />Link into prompt<DropdownMenuShortcut keys={['l']} />
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className={ITEM} onSelect={() => actions.openFolder(tab.projectPath)}>
            <Folder />Open folder<DropdownMenuShortcut keys={['f']} />
          </DropdownMenuItem>
          {closable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive className={ITEM} onSelect={() => actions.closeTab(tab.id)}>
                <Close />Close tab<DropdownMenuShortcut keys={['x']} />
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
