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
  onToggle,
  onActivateFile,
  onTogglePin,
}) {
  const isDimmed = isDimmedEntry(name);

  return (
    <div className="w-full" style={isDimmed ? { opacity: 0.45 } : undefined}>
      {isDir ? (
        <FolderNode
          path={path}
          name={name}
          depth={depth}
          isExpanded={isExpanded}
          isCurrentPath={isCurrentPath}
          isCursor={isCursor}
          onToggle={onToggle}
        />
      ) : (
        <FileNode
          path={path}
          name={name}
          depth={depth}
          isCurrentPath={isCurrentPath}
          isCursor={isCursor}
          isSelected={isSelected}
          isPinned={isPinned}
          isDeleted={isDeleted}
          gitAdded={gitAdded}
          gitDeleted={gitDeleted}
          gitStatus={gitStatus}
          onActivateFile={onActivateFile}
          onTogglePin={onTogglePin}
        />
      )}
    </div>
  );
});
