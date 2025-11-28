import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Button } from "./ui/button";
import { Folder, File, ChevronRight, ChevronDown, CornerDownRight } from "lucide-react";

export function FileTree({ nodes, expandedFolders, currentPath, onToggle, onSendToTerminal }) {

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
          onSendToTerminal={onSendToTerminal}
        />
      ))}
    </SidebarMenu>
  );
}

function TreeNode({ node, expandedFolders, currentPath, onToggle, onSendToTerminal }) {
  const isExpanded = expandedFolders.has(node.path);
  const isCurrentPath = currentPath === node.path;
  const hasChildren = node.children && Array.isArray(node.children) && node.children.length > 0;
  const depth = node.depth || 0;

  return (
    <>
      <SidebarMenuItem className="me-4">
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
          // File: display with send-to-terminal button
          <div
            style={{ paddingLeft: `${depth * 8 + 2}px` }}
            className={`flex items-center w-full py-px pr-px ${isCurrentPath ? 'bg-accent' : ''}`}
          >
            {/* Main file display (non-clickable) */}
            <div className="flex items-center justify-start w-full">
              <File className="w-3 h-3 ml-1 mr-1.5" />
              <span className="truncate text-xs">{node.name}</span>
            </div>

            {/* Send to terminal button */}
            <button
              className="p-1 transition-opacity duration-200 opacity-60 hover:opacity-100 hover:bg-white/10 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onSendToTerminal(node.path);
              }}
              title="Send path to terminal"
            >
              <CornerDownRight className="w-3 h-3" />
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
            onSendToTerminal={onSendToTerminal}
          />
        ))
      )}
    </>
  );
}
