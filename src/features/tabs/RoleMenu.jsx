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
// prompts carry the role too, so they are re-tagged with it.
function RoleMenu({ tab, children }) {
  const { setTabRole } = useTabManager();
  const setRole = (role) => {
    setTabRole(tab.id, role);
    setLinkedRepoRole(tab.projectPath, role || undefined);
  };
  return (
    // Portalled menu clicks still bubble through React to the row.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
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
export function RoleChip({ tab }) {
  return (
    <RoleMenu tab={tab}>
      <RowAction
        title="Change repo role"
        className="shrink-0 px-1 text-[10px] font-mono text-muted-foreground edge-engraved hover:text-[var(--ins-lamp)]"
      >
        {repoRoleLabel(tab.role)}
      </RowAction>
    </RoleMenu>
  );
}

/** "tag", for a tab with no role yet. */
export function RoleTagButton({ tab }) {
  return (
    <RoleMenu tab={tab}>
      <RowAction
        title="Tag repo role"
        className="px-1 text-[10px] font-mono text-muted-foreground edge-engraved hover:text-[var(--ins-lamp)]"
      >
        tag
      </RowAction>
    </RoleMenu>
  );
}
