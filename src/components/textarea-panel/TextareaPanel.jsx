import React, { useRef, useMemo, useState } from "react";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { ActionButtons } from "./ActionButtons";
import { Button } from "../ui/button";
import { TemplateSelector } from "./TemplateSelector";
import { FileGroupsDropdown } from "../sidebar/FileGroupsDropdown";
import { CompactProjectButton } from "./CompactProjectButton";
import { CompactSectionsDialog } from "./CompactSectionsDialog";
import { FlowchartDialog } from "./FlowchartDialog";
import { buildGraphData } from "../../utils/generateFlowchart";
import { AtMentionModal } from "../AtMentionModal";
import { X, Map } from "lucide-react";
import { getRelativePath } from "../../utils/pathUtils";
import { TokenCostEstimate } from "../TokenCostEstimate";
import { useTokenBudget } from "../../contexts/TokenBudgetContext";

/**
 * Main textarea panel component for multi-line input with file selection
 * Provides a space to compose commands and manage selected files
 */
export function TextareaPanel({
  value,
  onChange,
  onSend,
  onClose,
  textareaRef,
  disabled = false,
  selectedFiles,
  currentPath,
  keepFilesAfterSend = false,
  onToggleKeepFiles,
  selectedTemplateId,
  onSelectTemplate,
  onManageTemplates,
  appendOrchestration = true,
  onToggleOrchestration,
  orchestrationTokenEstimate,
  templateDropdownOpen,
  onTemplateDropdownOpenChange,
  tokenUsage,
  projectPath,
  onLoadGroup,
  onSaveGroup,
  onCompactProject,
  isCompacting,
  compactProgress,
  compactedProject,
  onClearCompactedProject,
  onUpdateCompactedProject,
  selectedElements,
  onClearElements,
  atMentionActive = false,
  atMentionQuery = '',
  atMentionResults = null,
  atMentionSelectedIndex = 0,
  onAtMentionNavigate,
  onAtMentionSelect,
  onAtMentionClose,
  fileStates,
  onSetFileState,
  onToggleFile,
}) {
  const { checkBudgetStatus } = useTokenBudget();
  const budgetStatus = checkBudgetStatus(currentPath);
  const budgetExhausted = budgetStatus.status === 'critical' && budgetStatus.percentage >= 100;

  // Count total selected elements and build tooltip content
  const { elementCount, elementsTooltipContent } = useMemo(() => {
    if (!selectedElements || selectedElements.size === 0) {
      return { elementCount: 0, elementsTooltipContent: null };
    }
    let count = 0;
    const fileEntries = [];
    selectedElements.forEach((elements, filePath) => {
      count += elements.length;
      const relativePath = getRelativePath(filePath, currentPath);
      fileEntries.push({ path: relativePath, elements });
    });

    const content = (
      <div className="flex flex-col gap-2">
        {fileEntries.map(({ path, elements }) => (
          <div key={path}>
            <div className="text-primary font-medium mb-1">{path}</div>
            <div className="flex flex-col gap-0.5 pl-2 border-l border-border/30">
              {elements.map(el => {
                const lineInfo = el.line === el.endLine ? `${el.line}` : `${el.line}-${el.endLine}`;
                return (
                  <div key={el.key} className="flex items-center gap-2">
                    <span className="text-muted-foreground" style={{ fontSize: 'var(--font-xs)' }}>{el.type}</span>
                    <span className="text-foreground">{el.displayName}</span>
                    <span className="text-muted-foreground ml-auto" style={{ fontSize: 'var(--font-xs)' }}>{lineInfo}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );

    return { elementCount: count, elementsTooltipContent: content };
  }, [selectedElements, currentPath]);

  const [compactDialogOpen, setCompactDialogOpen] = useState(false);
  const [flowchartOpen, setFlowchartOpen] = useState(false);

  const graphData = useMemo(() => {
    if (!compactedProject) return null;
    const fullOutput = compactedProject.fullOutput || compactedProject.output;
    return buildGraphData(fullOutput);
  }, [compactedProject]);

  // Remove duplicate sorting - use pre-sorted results from parent
  const sortedAtMentionResults = atMentionResults || [];

  const handleKeyDown = (e) => {
    // Handle @ mention modal navigation
    if (atMentionActive && sortedAtMentionResults.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onAtMentionNavigate('up');
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onAtMentionNavigate('down');
        return;
      }
      if (e.key === 'Enter' && !e.ctrlKey) {
        e.preventDefault();
        const selectedFile = sortedAtMentionResults[atMentionSelectedIndex];
        if (selectedFile) {
          const isAlreadySelected = selectedFiles instanceof Set && selectedFiles.has(selectedFile.path);
          if (isAlreadySelected) {
            // File already added (e.g. via arrow keys), just close the modal
            onAtMentionClose();
          } else {
            onAtMentionSelect(selectedFile.path, selectedFile.is_dir);
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onAtMentionClose();
        return;
      }
      // Left/Right arrow keys to cycle file mode (selects the file first if needed)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const selectedFile = sortedAtMentionResults[atMentionSelectedIndex];
        if (selectedFile && !selectedFile.is_dir) {
          e.preventDefault();
          const isAlreadySelected = selectedFiles instanceof Set && selectedFiles.has(selectedFile.path);
          if (!isAlreadySelected) {
            // Add the file without closing the modal
            onToggleFile(selectedFile.path);
          }
          const FILE_STATES = ['modify', 'do-not-modify', 'use-as-example'];
          const currentState = (fileStates && fileStates.get(selectedFile.path)) || 'modify';
          const currentIndex = FILE_STATES.indexOf(currentState);
          const direction = e.key === 'ArrowRight' ? 1 : -1;
          const nextIndex = (currentIndex + direction + FILE_STATES.length) % FILE_STATES.length;
          onSetFileState(selectedFile.path, FILE_STATES[nextIndex]);
          return;
        }
      }
    }

    // Enter creates new lines (default behavior)
    // Ctrl+Enter is handled by the useTextareaShortcuts hook
    if (e.key === 'Enter' && !e.ctrlKey) {
      // Allow default newline behavior
    }
  };

  const handleSend = () => {
    onSend();
    // Note: File clearing is now handled by App.jsx based on keepFilesAfterSend state
  };

  const fileArray = Array.from(selectedFiles || new Set());

  return (
    <div className="flex flex-col border-t border-t-sketch bg-background p-2 gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onToggleOrchestration && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="orchestration"
                checked={appendOrchestration}
                onCheckedChange={onToggleOrchestration}
                disabled={disabled}
              />
              <label
                htmlFor="orchestration"
                className="text-muted-foreground cursor-pointer select-none" style={{ fontSize: 'var(--font-xs)' }}
              >
                orchestration
                {appendOrchestration && orchestrationTokenEstimate != null && (
                  <span className="text-muted-foreground/60 ml-1">(~{orchestrationTokenEstimate} tokens)</span>
                )}
              </label>
            </div>
          )}
          {onToggleKeepFiles && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="keep-files"
                checked={keepFilesAfterSend}
                onCheckedChange={onToggleKeepFiles}
                disabled={disabled}
              />
              <label
                htmlFor="keep-files"
                className="text-muted-foreground cursor-pointer select-none" style={{ fontSize: 'var(--font-xs)' }}
              >
                keep files
              </label>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const result = await onCompactProject();
                  if (result) setFlowchartOpen(true);
                }}
                disabled={disabled || isCompacting}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Map className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <span className="text-xs">Compact & open flowchart</span>
            </TooltipContent>
          </Tooltip>
          <CompactProjectButton
            onClick={onCompactProject}
            isCompacting={isCompacting}
            progress={compactProgress}
            disabled={disabled}
          />
          <FileGroupsDropdown
            projectPath={projectPath}
            onLoadGroup={onLoadGroup}
            onSaveGroup={onSaveGroup}
            hasSelectedFiles={fileArray.length > 0}
          />
          <TemplateSelector
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={onSelectTemplate}
            onManageTemplates={onManageTemplates}
            open={templateDropdownOpen}
            onOpenChange={onTemplateDropdownOpenChange}
          />
        </div>
      </div>

      {/* Selected elements indicator */}
      {elementCount > 0 && (
        <div className="flex items-center gap-2 px-2 py-1 bg-secondary border border-secondary rounded w-fit" style={{ fontSize: 'var(--font-xs)' }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 cursor-default">
                <span className="text-primary font-medium">
                  {elementCount} element{elementCount !== 1 ? 's' : ''} selected
                </span>
                <span className="text-muted-foreground">
                  from {selectedElements.size} file{selectedElements.size !== 1 ? 's' : ''}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-md text-left p-3">
              {elementsTooltipContent}
            </TooltipContent>
          </Tooltip>
          <button
            onClick={onClearElements}
            className="ml-auto p-0.5 hover:bg-white/10 rounded"
            title="Clear selected elements"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Compacted project indicator */}
      {compactedProject && (
        <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 border border-primary/20 rounded w-fit" style={{ fontSize: 'var(--font-xs)' }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setCompactDialogOpen(true)}
              >
                <span className="text-primary font-medium">
                  Project compacted
                </span>
                <span className="text-muted-foreground">
                  {compactedProject.fileCount} files · ~{compactedProject.formattedTokens} tokens · {compactedProject.compressionPercent}% smaller
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-md text-left p-3">
              <div className="space-y-1">
                <div>Click to toggle sections on/off</div>
                <div className="text-muted-foreground" style={{ fontSize: 'var(--font-xs)' }}>
                  {compactedProject.formattedOriginalTokens} → {compactedProject.formattedTokens} tokens
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setFlowchartOpen(true)}
                className="p-0.5 hover:bg-white/10 rounded text-primary hover:text-primary/80"
                title="View flowchart"
              >
                <Map className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Flowchart</TooltipContent>
          </Tooltip>
          <button
            onClick={onClearCompactedProject}
            className="p-0.5 hover:bg-white/10 rounded"
            title="Clear compacted project"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Compact sections dialog */}
      {compactedProject && (
        <CompactSectionsDialog
          open={compactDialogOpen}
          onOpenChange={setCompactDialogOpen}
          compactedProject={compactedProject}
          onUpdateCompactedProject={onUpdateCompactedProject}
        />
      )}
      {compactedProject && graphData && (
        <FlowchartDialog
          open={flowchartOpen}
          onOpenChange={setFlowchartOpen}
          graphData={graphData}
        />
      )}

      {/* Main content area */}
      <div className="min-h-[120px] max-h-[300px] relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Waiting for terminal session..." : "Type your command here... (Ctrl+Enter to send)"}
          aria-label="Multi-line command input"
          aria-describedby="textarea-instructions"
          className="w-full h-full resize-none"
        />
        {/* @ mention autocomplete modal */}
        {atMentionActive && sortedAtMentionResults.length > 0 && (
          <AtMentionModal
            results={atMentionResults}
            selectedIndex={atMentionSelectedIndex}
            onSelect={onAtMentionSelect}
            currentPath={currentPath}
            query={atMentionQuery}
            selectedFiles={selectedFiles}
            fileStates={fileStates}
          />
        )}
      </div>

      {/* Footer row: instructions + action buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span id="textarea-instructions" className="text-muted-foreground font-mono" style={{ fontSize: 'var(--font-xs)' }}>
            {selectedTemplateId && !value?.trim() ? (
              <span className="text-primary">Ctrl+Enter to send template</span>
            ) : (
              "Ctrl+Enter: send"
            )}
          </span>
          <TokenCostEstimate
            textareaContent={value}
            selectedFiles={selectedFiles}
            projectPath={currentPath}
          />
        </div>
        <ActionButtons
          onSend={handleSend}
          disabled={disabled || budgetExhausted || (!value?.trim() && fileArray.length === 0 && !selectedTemplateId && elementCount === 0)}
          tokenUsage={tokenUsage}
        />
      </div>
    </div>
  );
}
