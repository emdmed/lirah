import { useId, useMemo, useState, memo } from "react";
import { TokenCostEstimate } from "../../features/token-budget/TokenCostEstimate";
import { basename } from "../../utils/pathUtils";
import { ProjectToolbar } from "./ProjectToolbar";
import { PromptToolbar } from "./PromptToolbar";
import { ContextChips } from "./ContextChips";
import { ModeSegment, InputModeSwitch } from "./ModeSegment";
import { summarizeFiles } from "./contextSummary";
import { PaneInfo } from "../PaneInfo";
import { PaneLegend } from "../instrument/PaneLegend";
import { KeyChord } from "../instrument/Keycap";

const NO_REPOS = [];
const NO_PATTERN_FILES = [];
const NO_PATTERNS = new Set();
const NO_FILES = new Set();
const NO_PROMPT = '';

/**
 * The prompt pane without the prompt: what the next prompt typed in the
 * terminal carries, in one line where it can.
 *
 *   [3] CONTEXT  sends with your next prompt ✦ ──────── type in terminal · box
 *   14 files: 12 edit · 2 read  [fn parse ×]           peek ✦ instructions ▾ project ▾
 *   ──────────────────────────────────────────────────── ~702 tok <$0.01
 *
 * The files pane already lists the files with their intent, so while it is
 * open they are one summary line here; chips cover only what it doesn't show
 * (elements, repos, template, patterns). With it closed, the files come back
 * as chips, with keep.
 *
 * Delivery is the legend's status: Lirah's Claude Code hook attaches the
 * context on submit, then the line reads what went, dimmed, for a moment.
 * Without the hook (other CLIs, hook off) an `insert` key types it instead.
 */
export const ContextStatus = memo(function ContextStatus({
  selectedFiles,
  fileStates,
  selectedElements,
  currentPath,
  linkedRepos = NO_REPOS,
  onSetFileState,
  onRemoveFile,
  onRemoveElement,
  onUnlinkRepo,
  keepFilesAfterSend = false,
  onToggleKeepFiles,
  selectedTemplateId,
  templateTitle,
  onSelectTemplate,
  onManageTemplates,
  templateDropdownOpen,
  onTemplateDropdownOpenChange,
  patternFiles = NO_PATTERN_FILES,
  selectedPatterns = NO_PATTERNS,
  onTogglePattern,
  onCreatePatterns,
  projectPath,
  onLoadGroup,
  onSaveGroup,
  promptBase,
  filesPaneOpen = true,
  hookDelivers = false,
  attachedSummary = null,
  onInsert,
  onOpenBox,
}) {
  const fileCount = selectedFiles?.size || 0;
  const hasContext = !!promptBase?.text;
  const [peekOpen, setPeekOpen] = useState(false);
  const peeking = peekOpen && hasContext;
  const peekId = useId();

  const fileSummary = useMemo(
    () => (filesPaneOpen ? summarizeFiles(selectedFiles, fileStates) : ''),
    [filesPaneOpen, selectedFiles, fileStates],
  );
  const elementCount = useMemo(() => {
    let count = 0;
    selectedElements?.forEach((els) => { count += els.length; });
    return count;
  }, [selectedElements]);

  // What the prompt carries besides files and elements, as chips.
  const extras = useMemo(() => {
    const out = linkedRepos.map((r) => ({
      key: `repo:${r.path}`,
      tag: 'repo',
      name: basename(r.path, r.path),
      title: r.path,
      onRemove: onUnlinkRepo ? () => onUnlinkRepo(r.path) : undefined,
    }));
    if (selectedTemplateId && templateTitle) {
      out.push({ key: 'template', tag: 'template', name: templateTitle, onRemove: () => onSelectTemplate?.(null) });
    }
    selectedPatterns.forEach((file) => {
      out.push({
        key: `pattern:${file}`,
        tag: 'pattern',
        name: file.replace(/\.md$/, ''),
        title: `.patterns/${file}`,
        onRemove: () => onTogglePattern?.(file),
      });
    });
    return out;
  }, [linkedRepos, onUnlinkRepo, selectedTemplateId, templateTitle, onSelectTemplate, selectedPatterns, onTogglePattern]);

  // Files as chips only when the files pane isn't showing them.
  const chipFiles = filesPaneOpen ? NO_FILES : selectedFiles;
  const hasChips = (!filesPaneOpen && fileCount > 0) || elementCount > 0 || extras.length > 0;

  // The lamp carries the emphasis; the words stay in ink.
  let status = null;
  let lamp;
  if (attachedSummary) {
    status = 'attached to your prompt';
    lamp = 'ok';
  } else if (hasContext) {
    status = hookDelivers ? 'sends with your next prompt' : 'not sent · insert it, then type your prompt';
    lamp = hookDelivers ? 'on' : undefined;
  }

  // Keep lives in the files pane's context header; here only while it's closed.
  const showKeep = !filesPaneOpen && onToggleKeepFiles;
  const showInsert = hasContext && !hookDelivers && !attachedSummary;

  let manifest;
  if (attachedSummary) {
    manifest = (
      <p className="px-1 text-[11px] font-mono text-muted-foreground truncate">
        {attachedSummary} went with your prompt
      </p>
    );
  } else if (hasContext) {
    manifest = (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {fileSummary && (
          <ModeSegment lit as="span" size="md">
            {fileSummary}
          </ModeSegment>
        )}
        {hasChips && (
          <ContextChips
            selectedFiles={chipFiles}
            fileStates={fileStates}
            selectedElements={selectedElements}
            currentPath={currentPath}
            onSetFileState={onSetFileState}
            onRemoveFile={onRemoveFile}
            onRemoveElement={onRemoveElement}
            extras={extras}
            size="md"
          />
        )}
      </div>
    );
  } else {
    manifest = (
      <p className="inline-flex items-center gap-1 px-1 text-[11px] font-mono text-muted-foreground">
        nothing attached · select files in
        <KeyChord keys={['alt', '1']} size="sm" />
        or add instructions
      </p>
    );
  }

  return (
    <div data-pane="3" data-title="[3] context" data-legend className="tui-pane flex flex-col px-2 pb-3 pt-[16px] gap-1.5">
      <PaneLegend
        index={3}
        title="Context"
        status={status}
        lamp={lamp}
        trailing={onOpenBox && <InputModeSwitch mode="terminal" onChange={onOpenBox} />}
      />
      {/* Announces pending / attached for screen readers; the legend shows it. */}
      <span className="sr-only" role="status" aria-live="polite">
        {status && `Context ${status}`}
      </span>

      {/* One row: what is sent flexes on the left, the controls that shape it
          sit on the right edge. Narrow panes wrap the controls under it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-6">
        <div className="min-w-0 flex-1">{manifest}</div>

        <div className="ml-auto flex shrink-0 items-center gap-x-3">
          {showInsert && (
            <ModeSegment
              size="md"
              lit
              onClick={onInsert}
              label="Insert the context into the terminal"
              title="This CLI has no Lirah hook: type the context into the terminal, then add your prompt"
            >
              insert
            </ModeSegment>
          )}
          {showKeep && (
            <ModeSegment
              size="md"
              lit={keepFilesAfterSend}
              lamp={keepFilesAfterSend ? 'ok' : 'off'}
              pressed={keepFilesAfterSend}
              onClick={() => onToggleKeepFiles(!keepFilesAfterSend)}
              label={keepFilesAfterSend ? 'Keep context after send is on. Turn off' : 'Keep context after send is off. Turn on'}
            >
              keep
            </ModeSegment>
          )}
          {(showInsert || showKeep) && <span className="ins-sep-star" aria-hidden="true" />}
          {hasContext && (
            <>
              <ModeSegment
                size="md"
                onClick={() => setPeekOpen((v) => !v)}
                aria-expanded={peeking}
                aria-controls={peekId}
                label={peeking ? 'Hide peek: the text that will be sent' : 'Peek at the text that will be sent'}
              >
                peek
              </ModeSegment>
              <span className="ins-sep-star" aria-hidden="true" />
            </>
          )}
          <div className="flex items-center gap-x-1">
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
              showSelectedBadge={false}
            />
            <ProjectToolbar
              projectPath={projectPath}
              onLoadGroup={onLoadGroup}
              onSaveGroup={onSaveGroup}
              fileCount={fileCount}
            />
          </div>
        </div>
      </div>

      {peeking && (
        <pre
          id={peekId}
          className="max-h-40 overflow-auto edge-engraved px-2 py-1 text-[11px] leading-snug font-mono whitespace-pre-wrap break-words text-muted-foreground"
          aria-label="Text that will be sent with the next prompt"
        >
          {promptBase.text}
        </pre>
      )}

      {hasContext && (
        <PaneInfo>
          <TokenCostEstimate promptBase={promptBase} textareaContent={NO_PROMPT} projectPath={currentPath} />
        </PaneInfo>
      )}
    </div>
  );
});
