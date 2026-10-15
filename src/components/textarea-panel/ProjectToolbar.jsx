import { ChevronDown, FolderOpen, Layers, Network } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "../ui/dropdown-menu";
import { CompactProjectButton } from "../../features/compact";
import { DesignButton } from "../../features/design/DesignButton";
import { FileGroupsMenuItems } from "../../features/file-groups";
import { KeyChord } from "../instrument/Keycap";

// Project-wide actions behind one menu. A running compact or design run
// surfaces as a live badge beside it, since that state must stay visible.
export function ProjectToolbar({ onCompactProject, isCompacting, compactProgress, disabled, projectPath, onLoadGroup, onSaveGroup, fileCount, onOpenDesign, designRunning, designHasSpec }) {
  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="gap-1 px-1.5" aria-label="Project actions">
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
          <DropdownMenuItem
            onClick={onOpenDesign}
            disabled={disabled || !projectPath}
            className="text-[11px] py-1.5 cursor-pointer"
          >
            <Network className="h-3 w-3 mr-1.5" />
            {designHasSpec ? 'Open design diagram' : 'Diagram this conversation'}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-[11px] py-1.5">
              <FolderOpen className="h-3 w-3 mr-1.5" />
              File groups
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48 text-xs">
              <FileGroupsMenuItems
                projectPath={projectPath}
                onLoadGroup={onLoadGroup}
                onSaveGroup={onSaveGroup}
                hasSelectedFiles={fileCount > 0}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      {isCompacting && (
        <CompactProjectButton onClick={onCompactProject} isCompacting progress={compactProgress} disabled={disabled} />
      )}
      {designRunning && <DesignButton onClick={onOpenDesign} isRunning />}
    </div>
  );
}
