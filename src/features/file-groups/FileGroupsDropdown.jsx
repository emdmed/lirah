import { FolderOpen, Save, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { useFileGroups } from './FileGroupsContext';

export function FileGroupsDropdown({ projectPath, onLoadGroup, onSaveGroup, hasSelectedFiles }) {
  const { getGroupsForProject, removeGroup } = useFileGroups();

  const groups = getGroupsForProject(projectPath);

  const handleDelete = (e, groupId) => {
    e.stopPropagation();
    removeGroup(groupId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="File groups"
          title="File groups"
        >
          <FolderOpen className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-48 text-xs">
        {groups.length === 0 ? (
          <DropdownMenuItem disabled className="text-[10px] text-muted-foreground">
            No groups saved
          </DropdownMenuItem>
        ) : (
          <>
            {groups.map((group) => (
              <DropdownMenuItem
                key={group.id}
                onClick={() => onLoadGroup(group)}
                className="flex items-center justify-between text-[10px] py-1.5 cursor-pointer group"
              >
                <span className="truncate pr-2">{group.name}</span>
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground">{group.files.length}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-4 w-4 opacity-0 group-hover:opacity-60 hover:!opacity-100"
                    onClick={(e) => handleDelete(e, group.id)}
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={onSaveGroup}
          disabled={!hasSelectedFiles}
          className="text-[10px] py-1.5 cursor-pointer"
        >
          <Save className="h-3 w-3 mr-1.5" />
          Save as Group...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
