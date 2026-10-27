import { ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { FileGroupsMenuItems } from "../../features/file-groups";

// The project's context sets (saved context) behind one menu.
export function ProjectToolbar({ projectPath, onLoadGroup, onSaveGroup, fileCount, label = "project" }) {
  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="gap-1 px-1.5" aria-label="Project actions and context sets">
            {label}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-56 text-xs">
          <DropdownMenuLabel
            title="Saved context for this project. Replace or add to the current context."
          >
            Context sets
          </DropdownMenuLabel>
          <FileGroupsMenuItems
            projectPath={projectPath}
            onLoadGroup={onLoadGroup}
            onSaveGroup={onSaveGroup}
            hasSelectedFiles={fileCount > 0}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
