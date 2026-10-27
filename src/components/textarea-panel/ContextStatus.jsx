import { useId, useMemo, useState, memo } from "react";
import { cn } from "@/lib/utils";
import { TokenCostEstimate } from "../../features/token-budget/TokenCostEstimate";
import { basename } from "../../utils/pathUtils";
import { ProjectToolbar } from "./ProjectToolbar";
import { PromptToolbar } from "./PromptToolbar";
import { ContextChips } from "./ContextChips";
import { ModeSegment, InputModeSwitch } from "./ModeSegment";
import { MODE_TOKENS, FILE_STATE_LABELS, FILE_STATE_ORDER } from "./FileStateSelector";
import { PaneInfo } from "../PaneInfo";
import { PaneLegend } from "../instrument/PaneLegend";
import { KeyChord } from "../instrument/Keycap";
import { Lamp } from "../instrument/Lamp";
import { FrameHints } from "../instrument/FrameHints";

const NO_REPOS = [];
const NO_PATTERN_FILES = [];
const NO_PATTERNS = new Set();
const NO_FILES = new Set();
const NO_ELEMENTS = new Map();
const NO_PROMPT = '';
// Up to this many files are listed by name; past it they fold to a tally
// while the files pane (which lists them all) is open.
const FILE_NAME_LIMIT = 8;
const TYPING = 'input, textarea, select, [contenteditable="true"]';

/**
 * The prompt pane without the prompt: a manifest of what Lirah appends to the
 * next prompt typed in the terminal, one labelled row per kind of context.
 *
 *   [3] CONTEXT  sends with your next prompt ✦ ───── type prompts in terminal|box
 *
 *     FILES          [EDIT app.jsx ×] [READ README.md ×]
 *     CODE           [fn parse ×]
 *     REPOS          [repo api ×]
 *     INSTRUCTIONS   [template Bugfix ×] [pattern conventions ×]
 *   ─────────────────────────────────────────────────────────────────────────
 *     instructions ▾  saved sets ▾  ✦  keep  peek  insert
 *   ─ i insert ✦ p peek ✦ k keep ──────────────────────── ~702 tok <$0.01 ─
 *
 * Files are listed by name; more than FILE_NAME_LIMIT fold to a tally while
 * the files pane shows them. Alt+3 lands on the manifest; there i / p / k
 * insert, peek and keep, as the bottom line says.
 *
 * The manifest keeps a stable height for the common cases, so the terminal
 * above doesn't resize (and its CLI repaint) every time a row comes or goes.
 *
 * Delivery is the legend's status: Lirah's Claude Code hook attaches the
 * context on submit, then the manifest says what went, for a moment.
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

  const elementCount = useMemo(() => {
    let count = 0;
    selectedElements?.forEach((els) => { count += els.length; });
    return count;
  }, [selectedElements]);

  const repoChips = useMemo(() => linkedRepos.map((r) => ({
    key: `repo:${r.path}`,
    tag: r.role || 'repo',
    name: r.name || basename(r.path, r.path),
    title: r.path,
    onRemove: onUnlinkRepo ? () => onUnlinkRepo(r.path) : undefined,
  })), [linkedRepos, onUnlinkRepo]);

  const instructionChips = useMemo(() => {
    const out = [];
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
  }, [selectedTemplateId, templateTitle, onSelectTemplate, selectedPatterns, onTogglePattern]);

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

  const keepShown = !!onToggleKeepFiles;
  const toggleKeep = () => onToggleKeepFiles?.(!keepFilesAfterSend);
  const togglePeek = () => setPeekOpen((v) => !v);

  // Pane keys, lazygit style: only while focus is in this pane and not in
  // something you type into; menus portal out, so they never see these.
  const onPaneKeyDown = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target instanceof Element && e.target.closest(TYPING)) return;
    const key = e.key.toLowerCase();
    if (key === 'i' && showInsert) onInsert?.();
    else if (key === 'p' && hasContext) togglePeek();
    else if (key === 'k' && keepShown) toggleKeep();
    else return;
    e.preventDefault();
  };

  const hints = [
    showInsert && { keys: ['i'], label: 'insert' },
    hasContext && { keys: ['p'], label: peeking ? 'hide text' : 'peek' },
    keepShown && { keys: ['k'], label: keepFilesAfterSend ? 'keep: on' : 'keep: off' },
  ].filter(Boolean);

  const chipProps = {
    fileStates,
    currentPath,
    onSetFileState,
    onRemoveFile,
    onRemoveElement,
    size: "md",
  };

  const rows = [];
  if (fileCount > 0) {
    rows.push(
      <ManifestRow key="files" label="files">
        {filesPaneOpen && fileCount > FILE_NAME_LIMIT ? (
          <FileTally selectedFiles={selectedFiles} fileStates={fileStates} />
        ) : (
          <ContextChips {...chipProps} selectedFiles={selectedFiles} selectedElements={NO_ELEMENTS} />
        )}
      </ManifestRow>,
    );
  }
  if (elementCount > 0) {
    rows.push(
      <ManifestRow key="code" label="code">
        <ContextChips {...chipProps} selectedFiles={NO_FILES} selectedElements={selectedElements} />
      </ManifestRow>,
    );
  }
  if (repoChips.length > 0) {
    rows.push(
      <ManifestRow key="repos" label="repos">
        <ContextChips {...chipProps} selectedFiles={NO_FILES} selectedElements={NO_ELEMENTS} extras={repoChips} />
      </ManifestRow>,
    );
  }
  if (instructionChips.length > 0) {
    rows.push(
      <ManifestRow key="instructions" label="instructions">
        <ContextChips {...chipProps} selectedFiles={NO_FILES} selectedElements={NO_ELEMENTS} extras={instructionChips} />
      </ManifestRow>,
    );
  }

  let manifest;
  if (attachedSummary) {
    manifest = (
      <p className="flex items-center gap-2 h-5 text-[11px] font-mono text-foreground">
        <Lamp state="ok" />
        <span className="truncate">{attachedSummary} went with your prompt</span>
      </p>
    );
  } else if (rows.length > 0) {
    manifest = <dl className="flex flex-col gap-y-2">{rows}</dl>;
  } else if (hasContext) {
    // Context with nothing to list (shouldn't happen): peek shows it.
    manifest = (
      <p className="h-5 flex items-center text-[11px] font-mono text-muted-foreground">
        context ready · peek to read it
      </p>
    );
  } else {
    manifest = (
      <div className="flex flex-col gap-1 text-[11px] font-mono leading-5">
        <p className="text-foreground">Nothing is appended to your next prompt.</p>
        <p className="text-muted-foreground">
          Select files in <KeyChord keys={['alt', '1']} size="sm" className="align-middle" />, add instructions
          below, or link another tab&apos;s repo in <KeyChord keys={['alt', '4']} size="sm" className="align-middle" />.
        </p>
      </div>
    );
  }

  return (
    <div data-pane="3" data-title="[3] context" data-legend className="group/ctx tui-pane flex flex-col px-4 pt-[22px] pb-[18px] gap-3" onKeyDown={onPaneKeyDown}>
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

      {/* What gets appended. A floor of two rows and a ceiling of four keep
          the pane's height (and so the terminal's rows) steady. */}
      <section
        aria-label="Context appended to your next prompt"
        // Alt+3 lands here (data-pane-focus), so the pane keys work at once
        // and the list scrolls with the arrow keys. The lit pane frame and
        // its key hints show the focus.
        tabIndex={0}
        data-pane-focus
        className="min-h-[48px] max-h-[112px] overflow-y-auto pr-1 -mx-1.5 px-1.5 focus:outline-none"
      >
        {manifest}
      </section>

      {/* One bank, left-aligned: what shapes the context, a star, then what
          happens to it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--ins-edge)] pt-2.5 -mx-1.5">
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
          label="saved sets"
        />
        {(showKeep || hasContext || showInsert) && <span className="ins-sep-star mx-1" aria-hidden="true" />}
        {showKeep && (
          <ModeSegment
            size="md"
            lit={keepFilesAfterSend}
            lamp={keepFilesAfterSend ? 'ok' : 'off'}
            pressed={keepFilesAfterSend}
            onClick={toggleKeep}
            label={keepFilesAfterSend ? 'Keep context after send is on. Turn off' : 'Keep context after send is off. Turn on'}
            title="Keep this context for the prompt after the next one  ·  k"
          >
            keep
          </ModeSegment>
        )}
        {hasContext && (
          <ModeSegment
            size="md"
            onClick={togglePeek}
            aria-expanded={peeking}
            aria-controls={peekId}
            label={peeking ? 'Hide the text that will be appended' : 'Read the text that will be appended'}
            title="Read the exact text appended to your prompt  ·  p"
          >
            {peeking ? 'hide text' : 'peek'}
          </ModeSegment>
        )}
        {showInsert && (
          <ModeSegment
            size="md"
            lit
            onClick={onInsert}
            label="Insert the context into the terminal"
            title="This CLI has no Lirah hook: type the context into the terminal, then add your prompt  ·  i  ·  :insert"
            className="px-2 shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
          >
            insert
          </ModeSegment>
        )}
      </div>

      {peeking && (
        <pre
          id={peekId}
          className="max-h-48 overflow-auto edge-engraved px-3 py-2 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words text-muted-foreground"
          aria-label="Text appended to your next prompt"
        >
          {promptBase.text}
        </pre>
      )}

      {hints.length > 0 && (
        <span
          className="tui-pane-info left-[10px] right-auto hidden items-center gap-[9px] group-focus-within/ctx:flex"
          aria-hidden="true"
        >
          <FrameHints hints={hints} />
        </span>
      )}

      {hasContext && (
        <PaneInfo>
          <TokenCostEstimate promptBase={promptBase} textareaContent={NO_PROMPT} projectPath={currentPath} />
        </PaneInfo>
      )}
    </div>
  );
});

// One kind of context: a printed label in a fixed column, its items beside it.
function ManifestRow({ label, children }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-4">
      <dt className="ins-legend h-5 flex items-center text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// Files as a tally by intent, once there are too many to list and the files
// pane shows them: `12 files: 8 EDIT · 3 READ · 1 COPY · all in the files pane`.
// Plain text: only chips are boxed, because only chips respond.
function FileTally({ selectedFiles, fileStates }) {
  const total = selectedFiles?.size || 0;
  const counts = {};
  selectedFiles?.forEach((path) => {
    const state = fileStates?.get(path) || 'modify';
    counts[state] = (counts[state] || 0) + 1;
  });
  const parts = FILE_STATE_ORDER.filter((s) => counts[s]);
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 min-h-5 text-[11px] font-mono">
      <span className="text-foreground">{total} files:</span>
      {parts.map((state, i) => (
        <span key={state} className="inline-flex items-center gap-x-1.5">
          {i > 0 && <span className="text-faint" aria-hidden="true">·</span>}
          <span className="text-foreground">{counts[state]}</span>
          <span className={cn("font-semibold tracking-[0.08em]", state === 'modify' ? 'text-foreground' : TALLY_TONE[state])}>
            {FILE_STATE_LABELS[state]}
          </span>
        </span>
      ))}
      <span className="text-faint" aria-hidden="true">·</span>
      <span className="text-muted-foreground">all in the files pane</span>
    </p>
  );
}

// The chips' intent colours, as text only.
const TALLY_TONE = Object.fromEntries(
  Object.entries(MODE_TOKENS).map(([state, cls]) => [state, cls.split(' ').filter((c) => c.startsWith('text-')).join(' ')]),
);
