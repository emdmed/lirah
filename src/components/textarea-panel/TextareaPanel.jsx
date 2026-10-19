import { useRef, useMemo, useState, useCallback, useEffect, useDeferredValue, Suspense } from "react";
import { useTokenBudget } from "../../features/token-budget/TokenBudgetContext";
import { TokenCostEstimate } from "../../features/token-budget/TokenCostEstimate";
import { lazyNamed } from "../../lib/lazyNamed";
import { usePromptText } from "../../hooks/usePromptStore";
import { withPromptText } from "../../hooks/buildPrompt";

import { ProjectToolbar } from "./ProjectToolbar";
import { PromptToolbar } from "./PromptToolbar";
import { ElementsIndicator } from "./ElementsIndicator";
import { LinkedReposIndicator } from "./LinkedReposIndicator";
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
const NO_RESULTS = [];
const NO_REPOS = [];
const NO_PATTERN_FILES = [];
const NO_PATTERNS = new Set();

// Loaded on first open, and mounted only while open.
const CompactSectionsDialog = lazyNamed(() => import("../../features/compact/CompactSectionsDialog"), "CompactSectionsDialog");

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
  linkedRepos = NO_REPOS,
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
  patternFiles = NO_PATTERN_FILES,
  selectedPatterns = NO_PATTERNS,
  onTogglePattern,
  promptPreview: promptPreviewBase,
  promptPreviewOpen = false,
  onTogglePromptPreview,
  onClearPromptSection,
}) {
  const containerRef = useRef(null);
  const [isWide, setIsWide] = useState(false);
  const value = usePromptText(promptStore);
  // Splicing the text in joins every section's body, so it runs only while the
  // preview is open, and on a deferred value so it never holds up a keystroke.
  const previewValue = useDeferredValue(promptPreviewOpen ? value : '');
  const promptPreview = useMemo(
    () => (promptPreviewBase && promptPreviewOpen ? withPromptText(promptPreviewBase, previewValue) : promptPreviewBase),
    [promptPreviewBase, promptPreviewOpen, previewValue]
  );
  const hasText = !!value?.trim();

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
  const sortedAtMentionResults = atMentionResults || NO_RESULTS;

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

  const isSendDisabled = disabled || budgetExhausted || (!hasText && fileArray.length === 0 && !selectedTemplateId && elementCount === 0 && linkedRepos.length === 0);

  // Overflow is a visible mechanical event on this panel: a disabled control
  // states its reason rather than dimming to 50% with nothing said.
  const sendBlockedReason = budgetExhausted
    ? 'Budget spent — raise it in Token Budget'
    : disabled
      ? 'No terminal session'
      : isSendDisabled
        ? 'Nothing to send'
        : null;

  // Everything below that does not read the text is memoized, so a keystroke
  // re-renders the input and the token estimate, not the toolbars and tooltips.
  const elementsIndicator = useMemo(() => (
    <ElementsIndicator
      selectedElements={selectedElements}
      currentPath={currentPath}
      elementCount={elementCount}
      onClearElements={onClearElements}
    />
  ), [selectedElements, currentPath, elementCount, onClearElements]);

  const compactedIndicator = useMemo(() => (
    <CompactedIndicator
      compactedProject={compactedProject}
      onClearCompactedProject={onClearCompactedProject}
      onOpenSections={() => setCompactDialogOpen(true)}
    />
  ), [compactedProject, onClearCompactedProject]);

  const projectZone = useMemo(() => (
    <ProjectToolbar
      onCompactProject={onCompactProject}
      isCompacting={isCompacting}
      compactProgress={compactProgress}
      disabled={disabled}
      projectPath={projectPath}
      onLoadGroup={onLoadGroup}
      onSaveGroup={onSaveGroup}
      fileCount={fileArray.length}
    />
  ), [onCompactProject, isCompacting, compactProgress, disabled, projectPath, onLoadGroup, onSaveGroup, fileArray.length]);

  const promptZone = useMemo(() => (
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
  ), [
    selectedTemplateId, onSelectTemplate, onManageTemplates, templateDropdownOpen, onTemplateDropdownOpenChange,
    patternFiles, selectedPatterns, onTogglePattern,
  ]);

  const footerInfo = (
    <TokenCostEstimate
      textareaContent={value}
      selectedFiles={selectedFiles}
      projectPath={currentPath}
    />
  );

  const dialogs = useMemo(() => (
    <Suspense fallback={null}>
      {compactedProject && compactDialogOpen && (
        <CompactSectionsDialog
          open={compactDialogOpen}
          onOpenChange={setCompactDialogOpen}
          compactedProject={compactedProject}
          onUpdateCompactedProject={onUpdateCompactedProject}
        />
      )}
    </Suspense>
  ), [compactedProject, compactDialogOpen, onUpdateCompactedProject]);

  // The typed text adds one part, so the count is known without building the preview.
  const partCount = (promptPreviewBase?.sections?.length ?? 0) + (hasText ? 1 : 0);

  const toolbarRow = useMemo(() => (
    <div className="flex items-center gap-2 flex-nowrap">
      {/* Every control carries its own label, so the two banks (project,
          prompt) are split by space rather than a rule or a name. */}
      {projectZone}
      <div className="ml-2 flex items-center gap-2">{promptZone}</div>
      {onTogglePromptPreview && (
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                className="gap-1 px-1.5"
                aria-pressed={promptPreviewOpen}
                onClick={onTogglePromptPreview}
                aria-expanded={promptPreviewOpen}
                aria-label={promptPreviewOpen ? "Hide what will be sent" : "Show what will be sent"}
              >
                <ScrollText className="h-3 w-3" />
                preview{partCount > 0 && !promptPreviewOpen && <span className="tube ml-1">{partCount}</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {promptPreviewOpen ? 'Hide' : 'Show'} what will be sent (Ctrl+Shift+E)
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <LinkedReposIndicator linkedRepos={linkedRepos} />
    </div>
  ), [projectZone, promptZone, onTogglePromptPreview, promptPreviewOpen, partCount, linkedRepos]);

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
