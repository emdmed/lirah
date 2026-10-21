import React from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { TreeGuide } from "./TreeGuide";

/**
 * Renders a folder row in the tree with expand/collapse functionality
 * @param {string} path - Folder path
 * @param {string} name - Folder name
 * @param {number} depth - Nesting depth (drives indent and guide lines)
 * @param {boolean} isExpanded - Whether folder is expanded
 * @param {boolean} isCurrentPath - Whether this is the current working directory
 * @param {boolean} isCursor - Whether the keyboard cursor is on this row
 * @param {boolean} isDimmed - Dotfile or build output: drawn in the faint tier
 * @param {Function} onToggle - Callback to toggle folder expansion
 */
export function FolderNode({ path, name, depth, isExpanded, isCurrentPath, isCursor, isDimmed, onToggle }) {
  return (
    <SidebarMenuButton
      size="sm"
      onClick={() => onToggle(path)}
      data-nav-row
      data-nav-activate
      data-cursor={isCursor ? '' : undefined}
      className={`p-0 cursor-pointer h-6 focus-ring ${isCurrentPath ? 'bg-accent' : ''}`}
    >
      <div className="flex items-center w-full h-full whitespace-pre" style={{ fontSize: 'var(--font-lg)' }}>
        <TreeGuide depth={depth} />
        {/* A faint disclosure glyph, and a trailing `/` as in `ls -F`. */}
        <span className="tui-tree-disclosure" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
        <span className={`truncate pl-1 ${isDimmed ? 'text-faint' : 'text-foreground'}`} title={name}>
          {name}<span className="text-faint">/</span>
        </span>
      </div>
    </SidebarMenuButton>
  );
}
