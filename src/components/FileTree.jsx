import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Button } from "./ui/button";
import { Folder, File, ChevronRight, ChevronDown, Copy, Check } from "lucide-react";

export function FileTree({ nodes, expandedFolders, currentPath, onToggle, selectedFiles, onToggleSelection }) {

  if (!nodes || nodes.length === 0) {
    return (
      <div className="p-1 opacity-50 text-[0.7rem]">
        No files or folders found
      </div>
    );
  }

  return (
    <SidebarMenu>
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          expandedFolders={expandedFolders}
          currentPath={currentPath}
          onToggle={onToggle}
          selectedFiles={selectedFiles}
          onToggleSelection={onToggleSelection}
        />
      ))}
    </SidebarMenu>
  );
}

function TreeNode({ node, expandedFolders, currentPath, onToggle, selectedFiles, onToggleSelection }) {
  const isExpanded = expandedFolders.has(node.path);
  const isCurrentPath = currentPath === node.path;
  const hasChildren = node.children && Array.isArray(node.children) && node.children.length > 0;
  const depth = node.depth || 0;
  const isSelected = selectedFiles && selectedFiles.includes(node.path);

  return (
    <>
      <SidebarMenuItem>
        {node.is_dir ? (
          // Folder: clickable button to expand/collapse
          <SidebarMenuButton
            size="sm"
            onClick={() => onToggle(node.path)}
            style={{ paddingLeft: `${depth * 8 + 2}px` }}
            className={`cursor-pointer ${isCurrentPath ? 'bg-accent' : ''}`}
          >
            <div className="flex items-center w-full">
              <div className="w-3 flex items-center">
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3xs h-3" />
                )}
              </div>
              <Folder className="w-3 h-3 ml-1 mr-1.5" />
              <span>{node.name}</span>
            </div>
          </SidebarMenuButton>
        ) : (
          // File: display with copy button
          <div
            style={{ paddingLeft: `${depth * 8 + 2}px` }}
            className={`flex items-center w-full py-px pr-px ${isCurrentPath ? 'bg-accent' : ''}`}
          >
            {/* Main file display (non-clickable) */}
            <div className="flex items-center justify-start w-full" >
              <File className="w-3 h-3 ml-1 mr-1.5" />
              <span className="truncate text-xs">{node.name}</span>
            </div>

            {/* Selection toggle button */}
            <button
              variant="icon-sm"
              className={`p-1 transition-opacity duration-200 hover:opacity-100 ${isSelected ? 'opacity-100' : 'opacity-60'}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(node.path);
              }}
              title={isSelected ? "Deselect file" : "Select file"}
            >
              {isSelected ? (
                <Check className="w-3 h-3 text-blue-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        )}
      </SidebarMenuItem>

      {/* Recursively render children if expanded */}
      {node.is_dir && isExpanded && hasChildren && (
        node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            expandedFolders={expandedFolders}
            currentPath={currentPath}
            onToggle={onToggle}
            selectedFiles={selectedFiles}
            onToggleSelection={onToggleSelection}
          />
        ))
      )}
    </>
  );
}
