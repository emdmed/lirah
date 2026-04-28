import { CompactProjectButton } from "../../features/compact";
import { FileGroupsDropdown } from "../../features/file-groups";

export function ProjectToolbar({ onCompactProject, isCompacting, compactProgress, disabled, projectPath, onLoadGroup, onSaveGroup, fileCount, isWide }) {
  return (
    <div className={`flex items-center gap-1 rounded-none py-1 ${isWide ? 'flex-wrap' : ''}`}>
      <CompactProjectButton
        onClick={onCompactProject}
        isCompacting={isCompacting}
        progress={compactProgress}
        disabled={disabled}
      />
      <div className="w-px h-3 bg-border/30" />
      <FileGroupsDropdown
        projectPath={projectPath}
        onLoadGroup={onLoadGroup}
        onSaveGroup={onSaveGroup}
        hasSelectedFiles={fileCount > 0}
      />
    </div>
  );
}
