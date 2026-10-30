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
function RoleMenu({ tab, open, onOpenChange, children }) {
  const { setTabRole } = useTabManager();
  const setRole = (role) => {
    setTabRole(tab.id, role);
    setLinkedRepoRole(tab.projectPath, role || undefined);
  };
  return (
    // Portalled menu clicks still bubble through React to the row.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-xs">
          <DropdownMenuRadioGroup value={tab.role ?? ''} onValueChange={setRole}>
            {REPO_ROLES.map((r) => (
              <DropdownMenuRadioItem key={r.value} value={r.value}>
                {r.label}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuRadioItem value="">None</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
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

/** "[role]", for a tab with no repo role yet. */
export function RoleTagButton({ tab, open, onOpenChange }) {
  return (
    <RoleMenu tab={tab} open={open} onOpenChange={onOpenChange}>
      <RowAction tabIndex={-1} title="Tag this repo's role: ui, api, db… (t)" className={PRINTED}>
        [role]
      </RowAction>
    </RoleMenu>
  );
}
