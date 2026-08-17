import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { Pencil } from "lucide-react";
import { CompactSectionsDialog, FlowchartDialog, buildGraphData } from "../../features/compact";
import { DesignDialog, useDesignExtraction } from "../../features/design";
import { useTokenBudget } from "../../features/token-budget";

import { ProjectToolbar } from "./ProjectToolbar";
import { PromptToolbar } from "./PromptToolbar";
import { ElementsIndicator } from "./ElementsIndicator";
import { CompactedIndicator } from "./CompactedIndicator";
import { TokenUsageDisplay } from "./TokenUsageDisplay";
import { TextareaArea } from "./TextareaArea";
import { PatternsSelector } from "../../features/patterns";

const FILE_STATES = ['modify', 'do-not-modify', 'use-as-example'];

export function TextareaPanel({
  value,
  onChange,
  onSend,
  onClose,
  textareaRef,
  disabled = false,
  selectedFiles,
  currentPath,
  selectedTemplateId,
  onSelectTemplate,
  onManageTemplates,

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
  onClearContext,
  sessionId,
  patternFiles = [],
  selectedPatterns = new Set(),
  onTogglePattern,
}) {
  const containerRef = useRef(null);
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timeoutId = null;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setIsWide((prev) => {
            // Hysteresis: widen at 920, narrow at 880 to prevent flickering
            if (prev && width < 880) return false;
            if (!prev && width >= 920) return true;
            return prev;
          });
        }, 100);
      }
    });
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(timeoutId); };
  }, []);

  const { checkBudgetStatus } = useTokenBudget();
  const budgetStatus = checkBudgetStatus(currentPath);
  const budgetExhausted = budgetStatus.status === 'critical' && budgetStatus.percentage >= 100;

  const elementCount = useMemo(() => {
    if (!selectedElements || selectedElements.size === 0) return 0;
    let count = 0;
    selectedElements.forEach((elements) => { count += elements.length; });
    return count;
  }, [selectedElements]);

  const fileArray = useMemo(() => Array.from(selectedFiles || new Set()), [selectedFiles]);

  const [compactDialogOpen, setCompactDialogOpen] = useState(false);
  const [flowchartOpen, setFlowchartOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);

  // Lives above the dialog on purpose: closing the dialog must not cancel a
  // running extraction, and reopening should show the finished diagram.
  const designExtraction = useDesignExtraction();

  // Clicking a file in the design panel pulls it into the prompt context —
  // the diagram doubles as a way to select what you want to work on next.
  const handleOpenDesignFile = useCallback(
    (relPath) => {
      if (!projectPath || !onToggleFile) return;
      onToggleFile(relPath.startsWith('/') ? relPath : `${projectPath}/${relPath}`);
    },
    [projectPath, onToggleFile]
  );

  // Asking about a selection in the diagram continues the conversation here:
  // the composed question lands in the prompt box (appended, never replacing
  // what was already typed) and the parts' files come with it as context.
  const handleDesignAsk = useCallback(
    (prompt, { files = [] } = {}) => {
      if (projectPath && onToggleFile) {
        for (const file of files) {
          const abs = file.startsWith('/') ? file : `${projectPath}/${file}`;
          // onToggleFile toggles — re-adding an already selected file would
          // silently drop it from the context.
          if (!(selectedFiles instanceof Set) || !selectedFiles.has(abs)) onToggleFile(abs);
        }
      }
      const existing = value?.trim() ? `${value.trimEnd()}\n\n` : '';
      onChange(`${existing}${prompt}\n`);
      requestAnimationFrame(() => textareaRef?.current?.focus());
    },
    [projectPath, onToggleFile, selectedFiles, value, onChange, textareaRef]
  );

  const graphData = useMemo(() => {
    if (!compactedProject) return null;
    const fullOutput = compactedProject.fullOutput || compactedProject.output;
    return buildGraphData(fullOutput);
  }, [compactedProject]);

  const sortedAtMentionResults = atMentionResults || [];

  const handleKeyDown = useCallback((e) => {
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
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const selectedFile = sortedAtMentionResults[atMentionSelectedIndex];
        if (selectedFile && !selectedFile.is_dir) {
          e.preventDefault();
          const isAlreadySelected = selectedFiles instanceof Set && selectedFiles.has(selectedFile.path);
          if (!isAlreadySelected) {
            onToggleFile(selectedFile.path);
          }
          const currentState = (fileStates && fileStates.get(selectedFile.path)) || 'modify';
          const currentIndex = FILE_STATES.indexOf(currentState);
          const direction = e.key === 'ArrowRight' ? 1 : -1;
          const nextIndex = (currentIndex + direction + FILE_STATES.length) % FILE_STATES.length;
          onSetFileState(selectedFile.path, FILE_STATES[nextIndex]);
          return;
        }
      }
    }
  }, [atMentionActive, sortedAtMentionResults, atMentionSelectedIndex, selectedFiles, fileStates, onAtMentionNavigate, onAtMentionSelect, onAtMentionClose, onToggleFile, onSetFileState]);

  const handleSend = useCallback(() => { onSend(); }, [onSend]);

  const isSendDisabled = disabled || budgetExhausted || (!value?.trim() && fileArray.length === 0 && !selectedTemplateId && elementCount === 0);

  const elementsIndicator = (
    <ElementsIndicator
      selectedElements={selectedElements}
      currentPath={currentPath}
      elementCount={elementCount}
      onClearElements={onClearElements}
    />
  );

  const compactedIndicator = (
    <CompactedIndicator
      compactedProject={compactedProject}
      onClearCompactedProject={onClearCompactedProject}
      onOpenSections={() => setCompactDialogOpen(true)}
      onOpenFlowchart={() => setFlowchartOpen(true)}
    />
  );

  const projectZone = (
    <ProjectToolbar
      onCompactProject={onCompactProject}
      isCompacting={isCompacting}
      compactProgress={compactProgress}
      disabled={disabled}
      projectPath={projectPath}
      onLoadGroup={onLoadGroup}
      onSaveGroup={onSaveGroup}
      fileCount={fileArray.length}
      isWide={false}
      onOpenDesign={() => setDesignOpen(true)}
      designRunning={designExtraction.isRunning}
      designHasSpec={!!designExtraction.spec}
    />
  );

  const promptZone = (
    <div className="flex items-center gap-1">
      <PromptToolbar
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={onSelectTemplate}
        onManageTemplates={onManageTemplates}
        templateDropdownOpen={templateDropdownOpen}
        onTemplateDropdownOpenChange={onTemplateDropdownOpenChange}
      />
      <PatternsSelector
        patternFiles={patternFiles}
        selectedPatterns={selectedPatterns}
        onTogglePattern={onTogglePattern}
      />
    </div>
  );

  const footerInfo = (
    <TokenUsageDisplay
      tokenUsage={tokenUsage}
      textareaContent={value}
      selectedFiles={selectedFiles}
      projectPath={currentPath}
    />
  );

  const textareaArea = (
    <TextareaArea
      textareaRef={textareaRef}
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      isWide={isWide}
      elementsIndicator={elementsIndicator}
      compactedIndicator={compactedIndicator}
      selectedTemplateId={selectedTemplateId}
      onClearContext={onClearContext}
      sessionId={sessionId}
      handleSend={handleSend}
      isSendDisabled={isSendDisabled}
      footerInfo={footerInfo}
      atMentionActive={atMentionActive}
      atMentionResults={atMentionResults}
      atMentionSelectedIndex={atMentionSelectedIndex}
      onAtMentionSelect={onAtMentionSelect}
      currentPath={currentPath}
      atMentionQuery={atMentionQuery}
      selectedFiles={selectedFiles}
      fileStates={fileStates}
    />
  );

  const dialogs = (
    <>
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
      <DesignDialog
        open={designOpen}
        onOpenChange={setDesignOpen}
        extraction={designExtraction}
        projectPath={projectPath || currentPath}
        onOpenFile={handleOpenDesignFile}
        onAsk={handleDesignAsk}
      />
    </>
  );

  const toolbarRow = (
    <div className="flex items-center justify-between flex-nowrap overflow-hidden min-h-[32px] max-h-[32px]">
      <div
        className="flex items-center justify-center h-6 w-6 text-muted-foreground"
        title="Compose"
        aria-label="Compose"
      >
        <Pencil className="w-4 h-4" />
      </div>
      <div className="flex items-center gap-1">
        {projectZone}
        {promptZone}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="flex flex-col border-t border-t-sketch bg-background p-2 gap-2">
      {toolbarRow}
      {dialogs}
      {textareaArea}
    </div>
  );
}
