import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Folder, File, ChevronRight, ChevronDown, Copy, Check } from "lucide-react";

export function FileTree({ nodes, expandedFolders, currentPath, onToggle, selectedFiles, onToggleSelection }) {

  if (!nodes || nodes.length === 0) {
    return (
      <div style={{ padding: '0.5rem', opacity: 0.5, fontSize: '0.875rem' }}>
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
            onClick={() => onToggle(node.path)}
            style={{
              cursor: 'pointer',
              paddingLeft: `${depth * 16 + 8}px`,
            }}
            className={isCurrentPath ? 'bg-accent' : ''}
          >
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ width: '16px', display: 'flex', alignItems: 'center' }}>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </div>
              <Folder className="w-4 h-4 ml-1 mr-2" />
              <span>{node.name}</span>
            </div>
          </SidebarMenuButton>
        ) : (
          // File: display with copy button
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              paddingLeft: `${depth * 16 + 8}px`,
              paddingRight: '8px',
              paddingTop: '4px',
              paddingBottom: '4px',
            }}
            className={isCurrentPath ? 'bg-accent' : ''}
          >
            {/* Main file display (non-clickable) */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <File className="w-4 h-4 ml-1 mr-2" />
              <span style={{ fontSize: '0.875rem' }}>{node.name}</span>
            </div>

            {/* Selection toggle button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(node.path);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                opacity: isSelected ? 1 : 0.6,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.opacity = '0.6'; }}
              title={isSelected ? "Deselect file" : "Select file"}
            >
              {isSelected ? (
                <Check className="w-4 h-4 text-blue-500" />
              ) : (
                <Copy className="w-4 h-4" />
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
