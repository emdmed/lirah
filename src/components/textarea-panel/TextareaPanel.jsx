import { useRef, useMemo, useState, useCallback, useEffect, Suspense } from "react";
import { buildGraphData } from "../../features/compact/generateFlowchart";
import { useDesignExtraction } from "../../features/design/useDesignExtraction";
import { useTokenBudget } from "../../features/token-budget/TokenBudgetContext";
import { TokenCostEstimate } from "../../features/token-budget/TokenCostEstimate";
import { lazyNamed } from "../../lib/lazyNamed";
import { usePromptText } from "../../hooks/usePromptStore";
import { withPromptText } from "../../hooks/buildPrompt";

import { ProjectToolbar } from "./ProjectToolbar";
import { PromptToolbar } from "./PromptToolbar";
import { ElementsIndicator } from "./ElementsIndicator";
import { CompactedIndicator } from "./CompactedIndicator";
import { TextareaArea } from "./TextareaArea";
import { PatternsSelector } from "../../features/patterns";
import { PromptPreview } from "./PromptPreview";
import { Button } from "../ui/button";
import { PaneInfo } from "../PaneInfo";
import { PaneLegend } from "../instrument/PaneLegend";
import { ScrollText } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

const FILE_STATES = ['modify', 'do-not-modify', 'use-as-example'];

// Loaded on first open. The compact dialogs mount only while open;
// DesignDialog (a large hook tree) mounts on first open and then stays.
const CompactSectionsDialog = lazyNamed(() => import("../../features/compact/CompactSectionsDialog"), "CompactSectionsDialog");
const FlowchartDialog = lazyNamed(() => import("../../features/compact/FlowchartDialog"), "FlowchartDialog");
const DesignDialog = lazyNamed(() => import("../../features/design/DesignDialog"), "DesignDialog");

export function TextareaPanel({
  promptStore,
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
  promptPreview: promptPreviewBase,
  promptPreviewOpen = false,
  onTogglePromptPreview,
  onClearPromptSection,
}) {
  const containerRef = useRef(null);
  const [isWide, setIsWide] = useState(false);
  const value = usePromptText(promptStore);
  const promptPreview = useMemo(
    () => (promptPreviewBase ? withPromptText(promptPreviewBase, value) : promptPreviewBase),
    [promptPreviewBase, value]
  );

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
  // DesignDialog holds view state (drill-down, hidden layers, last source)
  // that must survive a close, so once opened it stays mounted.
  const [designMounted, setDesignMounted] = useState(false);
  if (designOpen && !designMounted) setDesignMounted(true);

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

  // Overflow is a visible mechanical event on this panel: a disabled control
  // states its reason rather than dimming to 50% with nothing said.
  const sendBlockedReason = budgetExhausted
    ? 'Budget spent — raise it in Token Budget'
    : disabled
      ? 'No terminal session'
      : isSendDisabled
        ? 'Nothing to send'
        : null;

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
    <TokenCostEstimate
      textareaContent={value}
      selectedFiles={selectedFiles}
      projectPath={currentPath}
    />
  );

  const dialogs = (
    <Suspense fallback={null}>
      {compactedProject && compactDialogOpen && (
        <CompactSectionsDialog
          open={compactDialogOpen}
          onOpenChange={setCompactDialogOpen}
          compactedProject={compactedProject}
          onUpdateCompactedProject={onUpdateCompactedProject}
        />
      )}
      {compactedProject && graphData && flowchartOpen && (
        <FlowchartDialog
          open={flowchartOpen}
          onOpenChange={setFlowchartOpen}
          graphData={graphData}
        />
      )}
      {designMounted && (
        <DesignDialog
          open={designOpen}
          onOpenChange={setDesignOpen}
          extraction={designExtraction}
          projectPath={projectPath || currentPath}
          onOpenFile={handleOpenDesignFile}
          onAsk={handleDesignAsk}
        />
      )}
    </Suspense>
  );

  const partCount = promptPreview?.sections?.length ?? 0;

  const toolbarRow = (
    <div className="flex items-center gap-2 flex-nowrap">
      {/* Every control carries its own label, so the two banks (project,
          prompt) are split by a rule rather than named. */}
      {projectZone}
      <span className="text-[var(--ins-edge-strong)] shrink-0 select-none" aria-hidden="true">│</span>
      {promptZone}
      {onTogglePromptPreview && (
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                className={`gap-1 px-1.5 ${promptPreviewOpen ? 'text-[var(--ins-lamp)]' : ''}`}
                onClick={onTogglePromptPreview}
                aria-expanded={promptPreviewOpen}
                aria-label={promptPreviewOpen ? "Hide what will be sent" : "Show what will be sent"}
              >
                <ScrollText className="h-3 w-3" />
                preview{partCount > 0 && !promptPreviewOpen && <span className="tube">:{partCount}</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {promptPreviewOpen ? 'Hide' : 'Show'} what will be sent (Ctrl+Shift+E)
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );

  const textareaArea = (
    <TextareaArea
      textareaRef={textareaRef}
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      elementsIndicator={elementsIndicator}
      compactedIndicator={compactedIndicator}
      onClearContext={onClearContext}
      sessionId={sessionId}
      handleSend={handleSend}
      isSendDisabled={isSendDisabled}
      sendBlockedReason={sendBlockedReason}
      budgetExhausted={budgetExhausted}
      atMentionActive={atMentionActive}
      atMentionResults={atMentionResults}
      atMentionSelectedIndex={atMentionSelectedIndex}
      onAtMentionSelect={onAtMentionSelect}
      currentPath={currentPath}
      atMentionQuery={atMentionQuery}
      selectedFiles={selectedFiles}
      fileStates={fileStates}
      toolbar={toolbarRow}
    />
  );

  return (
    <div ref={containerRef} data-pane="3" data-title="[3] prompt" data-legend className="tui-pane flex flex-col px-2 pb-4 pt-[16px] gap-1.5">
      <PaneLegend index={3} title="Prompt" />
      {dialogs}
      {promptPreviewOpen && promptPreview && (
        <PromptPreview
          sections={promptPreview.sections}
          text={promptPreview.text}
          onClearSection={onClearPromptSection}
        />
      )}
      {textareaArea}
      <PaneInfo>
        {footerInfo}
        {fileArray.length > 0 && <span> · {fileArray.length} file{fileArray.length === 1 ? '' : 's'}</span>}
      </PaneInfo>
    </div>
  );
}
