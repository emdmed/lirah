import React, { memo } from "react";
import { FolderNode } from "./FolderNode";
import { FileNode } from "./FileNode";
import { isDimmedEntry } from "./utils/lsColors";

/**
 * One row of the (flattened, virtualized) file tree. Takes only primitive
 * props plus stable callbacks, so the default shallow memo comparison skips
 * every row whose own state did not change.
 */
export const TreeNode = memo(function TreeNode({
  path,
  name,
  depth = 0,
  isDir,
  isExpanded,
  isCurrentPath,
  isCursor,
  isSelected,
  isPinned,
  isDeleted,
  gitAdded,
  gitDeleted,
  gitStatus,
  selectedInside,
  agentMark,
  onToggle,
  onActivateFile,
  onTogglePin,
  onViewFile,
}) {
  const isDimmed = isDimmedEntry(name);

  return (
    <div className="w-full">
      {isDir ? (
        <FolderNode
          path={path}
          name={name}
          depth={depth}
          isExpanded={isExpanded}
          isCurrentPath={isCurrentPath}
          isCursor={isCursor}
          isDimmed={isDimmed}
          selectedInside={selectedInside}
          agentMark={agentMark}
          onToggle={onToggle}
        />
      ) : (
        <FileNode
          path={path}
          name={name}
          depth={depth}
          isCurrentPath={isCurrentPath}
          isCursor={isCursor}
          isDimmed={isDimmed}
          isSelected={isSelected}
          isPinned={isPinned}
          isDeleted={isDeleted}
          gitAdded={gitAdded}
          gitDeleted={gitDeleted}
          gitStatus={gitStatus}
          agentMark={agentMark}
          onActivateFile={onActivateFile}
          onTogglePin={onTogglePin}
          onViewFile={onViewFile}
        />
      )}
    </div>
  );
});
