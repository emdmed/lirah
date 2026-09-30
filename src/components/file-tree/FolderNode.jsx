import React from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Folder, ChevronRight, ChevronDown } from "lucide-react";
import { GUIDE_BRANCH, GUIDE_LAST } from "./constants";

/**
 * Renders a folder node in the tree with expand/collapse functionality
 * @param {Object} node - Node data (path, name, is_dir, children)
 * @param {string} guide - Tree guide columns inherited from ancestors
 * @param {boolean} isLast - Whether this is the last sibling
 * @param {boolean} isExpanded - Whether folder is expanded
 * @param {boolean} isCurrentPath - Whether this is the current working directory
 * @param {Function} onToggle - Callback to toggle folder expansion
 */
export function FolderNode({ node, guide, isLast, isExpanded, isCurrentPath, onToggle }) {
  return (
    <SidebarMenuButton
      size="sm"
      onClick={() => onToggle(node.path)}
      data-nav-row
      data-nav-activate
      className={`p-0 cursor-pointer h-[18px] focus-ring ${isCurrentPath ? 'bg-accent' : ''}`}
    >
      <div className="flex items-center w-full whitespace-pre" style={{ fontSize: 'var(--font-lg)' }}>
        <span className="tui-tree-guide shrink-0">{guide}{isLast ? GUIDE_LAST : GUIDE_BRANCH}</span>
        {isExpanded ? (
          <ChevronDown className="w-2.5 h-2.5 shrink-0" />
        ) : (
          <ChevronRight className="w-2.5 h-2.5 shrink-0" />
        )}
        <Folder className="w-2.5 h-2.5 ml-0.5 shrink-0 text-folder" />
        <span className="truncate pl-1 font-semibold text-folder" title={node.name}>{node.name}</span>
      </div>
    </SidebarMenuButton>
  );
}
