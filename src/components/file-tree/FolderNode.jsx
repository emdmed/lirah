import React from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Folder, ChevronRight, ChevronDown } from "lucide-react";
import { GUIDE_INDENT } from "./constants";

/**
 * Renders a folder row in the tree with expand/collapse functionality
 * @param {string} path - Folder path
 * @param {string} name - Folder name
 * @param {string} guide - Tree guide columns inherited from ancestors
 * @param {boolean} isExpanded - Whether folder is expanded
 * @param {boolean} isCurrentPath - Whether this is the current working directory
 * @param {boolean} isCursor - Whether the keyboard cursor is on this row
 * @param {Function} onToggle - Callback to toggle folder expansion
 */
export function FolderNode({ path, name, guide, isExpanded, isCurrentPath, isCursor, onToggle }) {
  return (
    <SidebarMenuButton
      size="sm"
      onClick={() => onToggle(path)}
      data-nav-row
      data-nav-activate
      data-cursor={isCursor ? '' : undefined}
      className={`p-0 cursor-pointer h-[18px] focus-ring ${isCurrentPath ? 'bg-accent' : ''}`}
    >
      <div className="flex items-center w-full whitespace-pre" style={{ fontSize: 'var(--font-lg)' }}>
        <span className="tui-tree-guide shrink-0 whitespace-pre">{guide}{GUIDE_INDENT}</span>
        {isExpanded ? (
          <ChevronDown className="w-2.5 h-2.5 shrink-0" />
        ) : (
          <ChevronRight className="w-2.5 h-2.5 shrink-0" />
        )}
        <Folder className="w-2.5 h-2.5 ml-0.5 shrink-0 text-muted-foreground" />
        <span className="truncate pl-1 font-semibold text-foreground" title={name}>{name}</span>
      </div>
    </SidebarMenuButton>
  );
}
