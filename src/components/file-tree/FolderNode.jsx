import React from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Folder, ChevronRight, ChevronDown } from "lucide-react";

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
      style={{ paddingLeft: `${depth * 10}px` }}
      className={`p-0 cursor-pointer h-5  ${isCurrentPath ? 'bg-accent' : ''}`}
    >
      <div className="flex items-center w-full">
        <div className="w-3 flex items-center">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3xs h-3" />
          )}
        </div>
        <Folder className="w-3 h-3 ml-1 mr-1" style={{ color: '#E6C384' }} />
        <span>{node.name}</span>
      </div>
    </SidebarMenuButton>
  );
}
