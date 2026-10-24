import { ChevronDown, Layers } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { CompactProjectButton } from "../../features/compact";
import { FileGroupsMenuItems } from "../../features/file-groups";
import { KeyChord } from "../instrument/Keycap";

// Project-wide actions and the project's context sets (saved context) behind
// one menu. A running compact surfaces as a live badge beside it, since that
// state must stay visible.
export function ProjectToolbar({ onCompactProject, isCompacting, compactProgress, disabled, projectPath, onLoadGroup, onSaveGroup, fileCount }) {
  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="gap-1 px-1.5" aria-label="Project actions and context sets">
            project
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56 text-xs">
          <DropdownMenuItem
            onClick={onCompactProject}
            disabled={disabled || isCompacting}
            className="text-[11px] py-1.5 cursor-pointer"
          >
            <Layers className="h-3 w-3 mr-1.5" />
            Compact project
            <KeyChord keys={["^", "⇧", "P"]} size="sm" className="ml-auto" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
      {isCompacting && (
        <CompactProjectButton onClick={onCompactProject} isCompacting progress={compactProgress} disabled={disabled} />
      )}
    </div>
  );
}
