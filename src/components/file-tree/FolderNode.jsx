import React from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Folder, ChevronRight, ChevronDown } from "lucide-react";
import { INDENT_PX } from "./constants";

/**
 * Renders a folder node in the tree with expand/collapse functionality
 * @param {Object} node - Node data (path, name, is_dir, children)
 * @param {number} depth - Tree depth for indentation
 * @param {boolean} isExpanded - Whether folder is expanded
 * @param {boolean} isCurrentPath - Whether this is the current working directory
 * @param {Function} onToggle - Callback to toggle folder expansion
 */
export function FolderNode({ node, depth, isExpanded, isCurrentPath, onToggle }) {
  return (
    <SidebarMenuButton
      size="sm"
      onClick={() => onToggle(node.path)}
      style={{ paddingLeft: `${depth * INDENT_PX}px` }}
      className={`p-0 cursor-pointer h-4 focus-ring ${isCurrentPath ? 'bg-accent' : ''}`}
    >
      <div className="flex items-center w-full">
        <div className="w-2.5 flex items-center">
          {isExpanded ? (
            <ChevronDown className="w-2.5 h-2.5" />
          ) : (
            <ChevronRight className="w-2.5 h-2.5" />
          )}
        </div>
        <Folder className="w-2.5 h-2.5 text-folder" />
        <span className="truncate pl-px" title={node.name}>{node.name}</span>
      </div>
    </SidebarMenuButton>
  );
}
