import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { Folder, MessageSquare } from "lucide-react";
import { CompactSectionsDialog, FlowchartDialog, buildGraphData } from "../../features/compact";
import { useTokenBudget } from "../../features/token-budget";
import { OrchestrationToggle } from "./OrchestrationToggle";
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
  onClearContext,
  sessionId,
  patternFiles = [],
  selectedPatterns = new Set(),
  onTogglePattern,
  onDeleteOrchestration,
  onOpenOrchestrationDashboard,
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
      isWide={isWide}
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
      orchestrationTokenEstimate={appendOrchestration ? orchestrationTokenEstimate : null}
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
    </>
  );

  if (isWide) {
    return (
      <div ref={containerRef} className="flex flex-col border-t border-t-sketch bg-background p-2 gap-2">
        {dialogs}
        <div className="flex gap-3" style={{ minHeight: '200px' }}>
          <div className="flex flex-col gap-2 flex-[2] min-w-0">
            {textareaArea}
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-[240px] max-w-[360px]">
            <OrchestrationToggle
              appendOrchestration={appendOrchestration}
              onToggleOrchestration={onToggleOrchestration}
              orchestrationTokenEstimate={orchestrationTokenEstimate}
              disabled={disabled}
              isWide
              onDeleteOrchestration={onDeleteOrchestration}
              onOpenDashboard={onOpenOrchestrationDashboard}
            />
            <div className="p-1">
              <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                <Folder className="w-3 h-3" /> Project
              </h4>
              {projectZone}
            </div>
            <div className="p-1">
              <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" /> Prompt
              </h4>
              {promptZone}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col border-t border-t-sketch bg-background p-2 gap-2">
      <div className="flex items-center justify-between flex-nowrap overflow-hidden min-h-[32px] max-h-[32px]">
        <OrchestrationToggle
          appendOrchestration={appendOrchestration}
          onToggleOrchestration={onToggleOrchestration}
          orchestrationTokenEstimate={orchestrationTokenEstimate}
          disabled={disabled}
          isWide={false}
          onDeleteOrchestration={onDeleteOrchestration}
        />
        <div className="flex items-center gap-2">
          {projectZone}
          <div className="w-px h-4 bg-border/50" />
          {promptZone}
        </div>
      </div>
      {dialogs}
      {textareaArea}
    </div>
  );
}
