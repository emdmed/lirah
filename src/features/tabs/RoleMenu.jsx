import { useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { useTabManager } from './TabContext';
import { setLinkedRepoRole } from './useLinkedRepos';
import { REPO_ROLES, repoRoleLabel } from './repoRoles';
import { RowAction } from './RowAction';

// The tab's repo role, picked from a menu. Links to the repo in other tabs'
// prompts carry the role too, so they are re-tagged with it. `open` and
// `onOpenChange` let the pane open it from the keyboard (t on a row).
/** The role choices as radio items, for this menu and the row's menu; None only once there is a role to clear. */
export function RoleItems({ tab, className }) {
  const { setTabRole } = useTabManager();
  const setRole = (role) => {
    setTabRole(tab.id, role);
    setLinkedRepoRole(tab.projectPath, role || undefined);
  };
  return (
    <DropdownMenuRadioGroup value={tab.role ?? ''} onValueChange={setRole}>
      {REPO_ROLES.map((r) => (
        <DropdownMenuRadioItem key={r.value} value={r.value} className={className}>
          {r.label}
        </DropdownMenuRadioItem>
      ))}
      {tab.role && <DropdownMenuRadioItem value="" className={className}>None</DropdownMenuRadioItem>}
    </DropdownMenuRadioGroup>
  );
}

function RoleMenu({ tab, open, onOpenChange, children }) {
  const wrapRef = useRef(null);
  return (
    // Portalled menu clicks still bubble through React to the row.
    <span ref={wrapRef} className="contents" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="text-xs"
          // The trigger is aria-hidden (RowAction), so focus goes back to the row.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            wrapRef.current?.closest('[data-tab-row]')?.focus();
          }}
        >
          <RoleItems tab={tab} />
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/** The tab's role as a chip that changes it. */
// Printed, not boxed (DESIGN rule 2): a bracketed legend that brightens.
const PRINTED = 'shrink-0 font-mono text-[11px] text-muted-foreground hover:text-[var(--ins-lamp)] data-[state=open]:text-[var(--ins-lamp)]';

export function RoleChip({ tab, open, onOpenChange }) {
  return (
    <RoleMenu tab={tab} open={open} onOpenChange={onOpenChange}>
      <RowAction tabIndex={-1} title="Change repo role (t)" className={PRINTED}>
        [{repoRoleLabel(tab.role)}]
      </RowAction>
    </RoleMenu>
  );
}
