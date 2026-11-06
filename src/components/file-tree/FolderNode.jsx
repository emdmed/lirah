import React from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { TreeGuide } from "./TreeGuide";
import { AgentMark } from "./AgentMark";

/**
 * Renders a folder row in the tree with expand/collapse functionality
 * @param {string} path - Folder path
 * @param {string} name - Folder name
 * @param {number} depth - Nesting depth (drives indent and guide lines)
 * @param {boolean} isExpanded - Whether folder is expanded
 * @param {boolean} isCurrentPath - Whether this is the current working directory
 * @param {boolean} isCursor - Whether the keyboard cursor is on this row
 * @param {boolean} isDimmed - Dotfile or build output: drawn in the faint tier
 * @param {number} [selectedInside] - Files inside selected into the prompt
 * @param {string} [agentMark] - An agent read or edited something inside (see AgentMark)
 * @param {Function} onToggle - Callback to toggle folder expansion
 */
export function FolderNode({ path, name, depth, isExpanded, isCurrentPath, isCursor, isDimmed, selectedInside, agentMark, onToggle }) {
  return (
    <SidebarMenuButton
      size="sm"
      onClick={() => onToggle(path)}
      data-nav-row
      data-nav-activate
      data-cursor={isCursor ? '' : undefined}
      className={`p-0 cursor-pointer h-6 focus-ring ${isCurrentPath ? 'bg-accent/15' : ''}`}
    >
      <div className="flex items-center w-full h-full whitespace-pre" style={{ fontSize: 'var(--font-lg)' }}>
        <TreeGuide depth={depth} />
        {/* A faint disclosure glyph, and a trailing `/` as in `ls -F`. */}
        <span className="tui-tree-disclosure" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
        <span className={`truncate pl-1 ${isDimmed ? 'text-faint' : 'text-foreground'}`} title={name}>
          {name}<span className="text-faint">/</span>
        </span>
        {(selectedInside > 0 || agentMark) && (
          <span className="ml-auto pr-[18px] flex items-center gap-1">
            {/* Inverse video, like the selected file rows it stands for. */}
            {selectedInside > 0 && (
              <span
                className="px-1 bg-foreground text-background tabular-nums leading-none"
                style={{ fontSize: 'var(--font-sm)' }}
                title={`${selectedInside} selected ${selectedInside === 1 ? 'file' : 'files'} in here`}
              >
                {selectedInside}
              </span>
            )}
            <AgentMark mark={agentMark} isDir />
          </span>
        )}
      </div>
    </SidebarMenuButton>
  );
}
