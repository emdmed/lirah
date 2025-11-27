import { useState } from "react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Folder, File, ChevronRight, ChevronDown, Copy, Check } from "lucide-react";

// Helper function to calculate relative path
function getRelativePath(absolutePath, cwdPath) {
  // Ensure both paths end without trailing slash
  const normalizedCwd = cwdPath.endsWith('/') ? cwdPath.slice(0, -1) : cwdPath;
  const normalizedFile = absolutePath.endsWith('/') ? absolutePath.slice(0, -1) : absolutePath;

  // If file is within CWD, remove CWD prefix
  if (normalizedFile.startsWith(normalizedCwd + '/')) {
    return normalizedFile.slice(normalizedCwd.length + 1);
  }

  // If file is CWD itself
  if (normalizedFile === normalizedCwd) {
    return '.';
  }

  // Otherwise return absolute path (fallback)
  return absolutePath;
}

// Helper function to copy text to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    // Fallback: create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}

export function FileTree({ nodes, expandedFolders, currentPath, onToggle }) {
  const [recentlyCopiedPath, setRecentlyCopiedPath] = useState(null);

  const handleCopyPath = async (node) => {
    const relativePath = getRelativePath(node.path, currentPath);
    const success = await copyToClipboard(relativePath);

    if (success) {
      console.log('Copied relative path:', relativePath);
      // Show checkmark icon
      setRecentlyCopiedPath(node.path);

      // Reset after 1.5 seconds
      setTimeout(() => {
        setRecentlyCopiedPath(null);
      }, 1500);
    }
  };

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
          onCopyPath={handleCopyPath}
          recentlyCopiedPath={recentlyCopiedPath}
        />
      ))}
    </SidebarMenu>
  );
}

function TreeNode({ node, expandedFolders, currentPath, onToggle, onCopyPath, recentlyCopiedPath }) {
  const isExpanded = expandedFolders.has(node.path);
  const isCurrentPath = currentPath === node.path;
  const hasChildren = node.children && Array.isArray(node.children) && node.children.length > 0;
  const depth = node.depth || 0;
  const wasRecentlyCopied = recentlyCopiedPath === node.path;

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

            {/* Copy button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyPath(node);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                opacity: wasRecentlyCopied ? 1 : 0.6,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => { if (!wasRecentlyCopied) e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { if (!wasRecentlyCopied) e.currentTarget.style.opacity = '0.6'; }}
              title="Copy relative path"
            >
              {wasRecentlyCopied ? (
                <Check className="w-4 h-4 text-green-500" />
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
            onCopyPath={onCopyPath}
            recentlyCopiedPath={recentlyCopiedPath}
          />
        ))
      )}
    </>
  );
}
