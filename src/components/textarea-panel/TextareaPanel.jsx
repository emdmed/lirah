import { useRef, useMemo, useState, useCallback, useEffect, memo } from "react";
import { useBudgetExhausted } from "../../features/token-budget/TokenBudgetContext";
import { TokenCostEstimate } from "../../features/token-budget/TokenCostEstimate";
import { usePromptText } from "../../hooks/usePromptStore";

import { ProjectToolbar } from "./ProjectToolbar";
import { PromptToolbar } from "./PromptToolbar";
import { PromptModeLine } from "./PromptModeLine";
import { ContextChips } from "./ContextChips";
import { TextareaArea } from "./TextareaArea";
import { PaneInfo } from "../PaneInfo";
import { PaneLegend } from "../instrument/PaneLegend";
import { InputModeSwitch } from "./ModeSegment";
import { useSeededSetting } from "../../features/settings/settingsStore";

const FILE_STATES = ['modify', 'do-not-modify', 'use-as-example'];
const NO_RESULTS = [];
const NO_REPOS = [];
const NO_PATTERN_FILES = [];
const NO_PATTERNS = new Set();

// Memoized: the tab re-renders for branch, cwd, changelog and secondary-focus
// changes the panel doesn't show. ProjectTab passes it stable callbacks.
export const TextareaPanel = memo(function TextareaPanel({
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
  compactionEnabled = false,
  onToggleCompaction,
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
  onCreatePatterns,
  promptBase,
  onClearRepos,
  onRemoveFile,
  onRemoveElement,
  keepFilesAfterSend = false,
  onToggleKeepFiles,
}) {
  const containerRef = useRef(null);
  const [isWide, setIsWide] = useState(false);
  const value = usePromptText(promptStore);
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

  // Only the exhausted flag: reading full usage here would re-render the
  // panel on every token poll.
  const budgetExhausted = useBudgetExhausted(currentPath);

  const elementCount = useMemo(() => {
    if (!selectedElements || selectedElements.size === 0) return 0;
    let count = 0;
    selectedElements.forEach((elements) => { count += elements.length; });
    return count;
  }, [selectedElements]);

  const fileArray = useMemo(() => Array.from(selectedFiles || new Set()), [selectedFiles]);

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
          // An attached file stays attached; the @query is consumed either way.
          onAtMentionSelect(selectedFile.path, selectedFile.is_dir, isAlreadySelected);
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

  // The context list folds away; the choice outlives the pane.
  const [chipsOpen, setChipsOpen] = useSeededSetting('contextChipsOpen');
  const toggleChips = useCallback(() => {
    setChipsOpen((prev) => !prev);
  }, [setChipsOpen]);

  // Everything below that does not read the text is memoized, so a keystroke
  // re-renders the input and the token estimate, not the toolbars and tooltips.
  const modeLine = useMemo(() => (
    <PromptModeLine
      fileCount={fileArray.length}
      chipsOpen={chipsOpen}
      onToggleChips={toggleChips}
      elementCount={elementCount}
      selectedElements={selectedElements}
      currentPath={currentPath}
      onClearElements={onClearElements}
      linkedRepos={linkedRepos}
      onClearRepos={onClearRepos}
      compactionEnabled={compactionEnabled}
      onToggleCompaction={onToggleCompaction}
      keepFilesAfterSend={keepFilesAfterSend}
      onToggleKeepFiles={onToggleKeepFiles}
    />
  ), [
    fileArray.length, chipsOpen, toggleChips,
    elementCount, selectedElements, currentPath, onClearElements,
    linkedRepos, onClearRepos, compactionEnabled, onToggleCompaction,
    keepFilesAfterSend, onToggleKeepFiles,
  ]);

  const contextChips = useMemo(() => (
    chipsOpen && (fileArray.length > 0 || elementCount > 0) ? (
      <ContextChips
        selectedFiles={selectedFiles}
        fileStates={fileStates}
        selectedElements={selectedElements}
        currentPath={currentPath}
        onSetFileState={onSetFileState}
        onRemoveFile={onRemoveFile}
        onRemoveElement={onRemoveElement}
      />
    ) : null
  ), [chipsOpen, fileArray.length, elementCount, selectedFiles, fileStates, selectedElements, currentPath, onSetFileState, onRemoveFile, onRemoveElement]);

  const projectZone = useMemo(() => (
    <ProjectToolbar
      projectPath={projectPath}
      onLoadGroup={onLoadGroup}
      onSaveGroup={onSaveGroup}
      fileCount={fileArray.length}
    />
  ), [projectPath, onLoadGroup, onSaveGroup, fileArray.length]);

  const promptZone = useMemo(() => (
    <div className="flex items-center gap-1">
      <PromptToolbar
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={onSelectTemplate}
        onManageTemplates={onManageTemplates}
        templateDropdownOpen={templateDropdownOpen}
        onTemplateDropdownOpenChange={onTemplateDropdownOpenChange}
        patternFiles={patternFiles}
        selectedPatterns={selectedPatterns}
        onTogglePattern={onTogglePattern}
        onCreatePatterns={onCreatePatterns}
      />
    </div>
  ), [
    selectedTemplateId, onSelectTemplate, onManageTemplates, templateDropdownOpen, onTemplateDropdownOpenChange,
    patternFiles, selectedPatterns, onTogglePattern, onCreatePatterns,
  ]);

  const footerInfo = (
    <TokenCostEstimate
      promptBase={promptBase}
      textareaContent={value}
      projectPath={currentPath}
    />
  );


  // One line under the input: what the send carries (context, instructions)
  // on the left, then the project menu. Send sits on the right edge
  // (TextareaArea). It wraps rather than clipping in a narrow pane.
  const toolbarRow = useMemo(() => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {modeLine}
      <div className="flex items-center gap-1">
        {promptZone}
        {projectZone}
      </div>
    </div>
  ), [modeLine, projectZone, promptZone]);

  const textareaArea = (
    <TextareaArea
      textareaRef={textareaRef}
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
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
      <PaneLegend
        index={3}
        title="Prompt"
        trailing={onClose && <InputModeSwitch mode="box" onChange={onClose} />}
      />
      {contextChips}
      {textareaArea}
      <PaneInfo>
        {footerInfo}
      </PaneInfo>
    </div>
  );
});
