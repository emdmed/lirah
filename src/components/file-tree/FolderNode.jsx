import React from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { ChevronRight, ChevronDown } from "lucide-react";
import { TreeGuide } from "./TreeGuide";

/**
 * Renders a folder row in the tree with expand/collapse functionality
 * @param {string} path - Folder path
 * @param {string} name - Folder name
 * @param {number} depth - Nesting depth (drives indent and guide lines)
 * @param {boolean} isExpanded - Whether folder is expanded
 * @param {boolean} isCurrentPath - Whether this is the current working directory
 * @param {boolean} isCursor - Whether the keyboard cursor is on this row
 * @param {Function} onToggle - Callback to toggle folder expansion
 */
export function FolderNode({ path, name, depth, isExpanded, isCurrentPath, isCursor, onToggle }) {
  return (
    <SidebarMenuButton
      size="sm"
      onClick={() => onToggle(path)}
      data-nav-row
      data-nav-activate
      data-cursor={isCursor ? '' : undefined}
      className={`p-0 cursor-pointer h-[22px] focus-ring ${isCurrentPath ? 'bg-accent' : ''}`}
    >
      <div className="flex items-center w-full h-full whitespace-pre" style={{ fontSize: 'var(--font-lg)' }}>
        <TreeGuide depth={depth} />
        {isExpanded ? (
          <ChevronDown className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate pl-1 font-semibold text-foreground" title={name}>{name}</span>
      </div>
    </SidebarMenuButton>
  );
}
