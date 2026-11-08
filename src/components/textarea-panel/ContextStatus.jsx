import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, memo } from "react";
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
import { Fig32FilesByIntent } from "./Fig32FilesByIntent";
import { Fig36FeatureFiles } from "../../features/feature-map/Fig36FeatureFiles";
import { focusPane, findVisiblePane } from "../../hooks/usePaneShortcuts";
import { PickerRow } from "../ui/picker";
import { matches } from "../../lib/shortcuts";
import { useToast } from "../../features/toast";
import { errorMessage } from "../../lib/errorMessage";
import { useFeatureMap } from "../../features/feature-map/useFeatureMap";
import { matchFeatures } from "../../features/feature-map/matchFeatures";
import { pinFeature, unpinFeature, useTabFeatures } from "../../features/feature-map/useTabFeatures";
import { getTypedLine, subscribeTypedLine } from "../../features/tabs/typedLine";

const NO_REPOS = [];
const NO_FILES = new Set();
const NO_ELEMENTS = new Map();
const NO_PROMPT = '';
// Up to this many files are listed by name; past it they fold to a tally
// while the files pane (which lists them all) is open.
const FILE_NAME_LIMIT = 8;
const TYPING = 'input, textarea, select, [contenteditable="true"]';
// Empty manifest: the filled manifest's rows, each holding a ghost chip
// (dashed, chip-sized) where its real chips will land. Two rows fill the
// section's 48px floor, so the pane keeps its height when context arrives.
// A ghost jumps to the pane that fills its row.
const GHOSTS = [
  { row: 'files', label: 'pick files', keys: ['alt', '1'], shortcut: 'Alt+1', pane: 1, title: 'Pick files in the files pane' },
  { row: 'features', label: 'add feature', keys: ['alt', '5'], shortcut: 'Alt+5', title: 'Pin a feature from the feature map' },
  { row: 'repos', label: "link a tab's repo", keys: ['alt', '4'], shortcut: 'Alt+4', pane: 4, title: "Link another tab's repo from the workspace pane" },
];
// Dashed in every state, so a ghost never passes for a real chip; hover and
// focus brighten it, and focus adds the ring real chips use.
// The hook's caps on feature context (buildPrompt and matchFeatures use them too).
const FEATURES_MAX = 3;
const FEATURE_FILES_MAX = 40;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const GHOST = "inline-flex items-center gap-1.5 h-5 shrink-0 pl-1.5 pr-1 border border-dashed border-[var(--ins-faint)] font-mono text-[11px] leading-none text-muted-foreground hover:text-foreground hover:border-[var(--ins-legend)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:text-foreground focus-visible:border-[var(--ins-legend)]";

/**
 * The prompt pane without the prompt: a manifest of what Lirah appends to the
 * next prompt typed in the terminal, one labelled row per kind of context.
 *
 *   [3] CONTEXT  sends with your next prompt ✦ ───── type prompts in terminal|box
 *
 *     FILES          [EDIT app.jsx ×] [READ README.md ×]
 *     CODE           [fn parse ×]
 *     REPOS          [repo api ×]
 *     INSTRUCTIONS   [template Bugfix ×]
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
  fileSymbols,
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
  projectPath,
  onLoadGroup,
  onSaveGroup,
  promptBase,
  filesPaneOpen = true,
  hookDelivers = false,
  attachedSummary = null,
  onInsert,
  onOpenBox,
  tabId,
  sessionId,
  featureProject,
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

  // Feature map context: pinned features (sent as FEATURE lines) and the ones
  // the prompt being typed names, which the hook adds on submit.
  const toast = useToast();
  const rootRef = useRef(null);
  const manifestRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const featureMap = useFeatureMap(featureProject);
  const mapFeatures = featureMap.map?.features;
  const hasMap = Array.isArray(mapFeatures) && mapFeatures.length > 0;
  const { pinnedFeatures } = useTabFeatures(tabId);
  // A key of the matches, so keystrokes that change nothing don't re-render.
  const matchKey = useSyncExternalStore(subscribeTypedLine, () => (hasMap
    ? matchFeatures(featureMap.map, getTypedLine(sessionId)).map((m) => `${m.id}\t${m.word}\t${m.files.length}`).join('\n')
    : ''));
  const matched = useMemo(() => {
    if (!matchKey) return [];
    const pinnedIds = new Set(pinnedFeatures.map((f) => f.id));
    return matchFeatures(featureMap.map, getTypedLine(sessionId)).filter((m) => !pinnedIds.has(m.id));
  }, [matchKey, pinnedFeatures, featureMap.map, sessionId]);
  const pin = (id) => {
    const f = mapFeatures?.find((x) => x.id === id);
    if (f) pinFeature(tabId, featureProject, f).catch((e) => toast.error(errorMessage(e)));
  };
  const featureChips = useMemo(() => pinnedFeatures.map((f) => ({
    key: `feature:${f.id}`,
    tag: 'feature',
    name: f.name,
    detail: plural(f.files.length, 'file'),
    title: f.files.join('\n'),
    onRemove: () => unpinFeature(tabId, f.id),
  })), [pinnedFeatures, tabId]);
  // What goes, as the hook caps it: pinned and matched are capped apart.
  const pinnedSent = pinnedFeatures.slice(0, FEATURES_MAX);
  const featureCount = pinnedSent.length + matched.length;
  const featureFiles = Math.min(FEATURE_FILES_MAX, pinnedSent.reduce((n, f) => n + f.files.length, 0))
    + matched.reduce((n, m) => n + m.files.length, 0);

  // Alt+5 opens the picker in the tab on screen. Capture, so xterm can't take it.
  useEffect(() => {
    if (!hasMap) return undefined;
    const onKeyDown = (e) => {
      if (!matches('add-feature', e)) return;
      if (!rootRef.current || findVisiblePane(3) !== rootRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setPickerOpen(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [hasMap]);
  const closePicker = () => {
    setPickerOpen(false);
    manifestRef.current?.focus({ preventScroll: true });
  };

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
    return out;
  }, [selectedTemplateId, templateTitle, onSelectTemplate]);

  // The lamp carries the emphasis; the words stay in ink.
  let status = null;
  let lamp;
  if (attachedSummary) {
    status = 'attached to your prompt';
    lamp = 'ok';
  } else if (hasContext) {
    status = hookDelivers ? 'sends with your next prompt' : 'not sent · insert it, then type your prompt';
    lamp = hookDelivers ? 'on' : undefined;
  } else {
    status = 'nothing attached · prompts go as typed';
  }
  if (featureCount > 0 && !attachedSummary) {
    status += ` · ${plural(featureCount, 'feature')} · ${plural(featureFiles, 'file')}`;
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
    fileSymbols,
  };

  const rows = [];
  if (fileCount > 0) {
    rows.push(
      <ManifestRow key="files" label="files">
        {filesPaneOpen && fileCount > FILE_NAME_LIMIT ? (
          <Fig32FilesByIntent
            selectedFiles={selectedFiles}
            fileStates={fileStates}
            fallback={<FileTally selectedFiles={selectedFiles} fileStates={fileStates} />}
          />
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
  if (hasMap && (featureChips.length > 0 || matched.length > 0)) {
    rows.push(
      <ManifestRow key="features" label="features">
        <div className="flex flex-wrap gap-1">
          {featureChips.length > 0 && (
            <ContextChips {...chipProps} selectedFiles={NO_FILES} selectedElements={NO_ELEMENTS} extras={featureChips} />
          )}
          {featureChips.length > 0 && <Fig36FeatureFiles features={pinnedFeatures} className="basis-full" />}
          {matched.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label="Features your prompt names, added on submit">
              {matched.map((m) => (
                <li
                  key={m.id}
                  className="inline-flex items-center shrink-0 max-w-full h-5 border border-dashed border-[var(--ins-faint)] font-mono text-[11px] leading-none"
                  title={`"${m.word}" in your prompt · the hook adds ${plural(m.files.length, 'file')} on submit`}
                >
                  <span className="pl-1 text-muted-foreground">{m.word}</span>
                  <span className="px-1 truncate text-foreground">{m.name}</span>
                  <button
                    type="button"
                    onClick={() => pin(m.id)}
                    aria-label={`Pin ${m.name} to the context`}
                    className="h-5 px-1.5 shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    pin
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
      <dl className="flex flex-col gap-y-2">
        {GHOSTS.filter((g) => g.row !== 'features' || hasMap).map((g) => (
          <ManifestRow key={g.row} label={g.row}>
            <button
              type="button"
              onClick={() => (g.pane ? focusPane(g.pane) : setPickerOpen(true))}
              title={g.title}
              aria-label={g.title}
              aria-keyshortcuts={g.shortcut}
              className={`group/ghost ${GHOST}`}
            >
              <span className="text-faint group-hover/ghost:text-foreground group-focus-visible/ghost:text-foreground" aria-hidden>+</span>
              <span>{g.label}</span>
              <KeyChord keys={g.keys} size="sm" />
            </button>
          </ManifestRow>
        ))}
      </dl>
    );
  }

  return (
    <div ref={rootRef} data-pane="3" data-title="[3] context" data-legend className="group/ctx tui-pane flex flex-col px-4 pt-[22px] pb-[18px] gap-3" onKeyDown={onPaneKeyDown}>
      <PaneLegend
        index={3}
        title="Context"
        note={status}
        lamp={lamp}
        trailing={onOpenBox && <InputModeSwitch mode="terminal" onChange={onOpenBox} />}
      />
      {/* Announces pending / attached for screen readers; the legend shows it. */}
      <span className="sr-only" role="status" aria-live="polite">
        {hasContext || attachedSummary ? `Context ${status}` : 'No context attached. Prompts go as typed.'}
      </span>

      {/* What gets appended. A floor of two rows and a ceiling of four keep
          the pane's height (and so the terminal's rows) steady. */}
      <section
        aria-label="Context appended to your next prompt"
        // Alt+3 lands here (data-pane-focus), so the pane keys work at once
        // and the list scrolls with the arrow keys. The lit pane frame and
        // its key hints show the focus.
        ref={manifestRef}
        tabIndex={0}
        data-pane-focus
        className="min-h-[48px] max-h-[112px] overflow-y-auto pr-1 -mx-1.5 px-1.5 focus:outline-none"
      >
        {manifest}
      </section>

      {pickerOpen && hasMap && (
        <FeaturePicker
          features={mapFeatures}
          pinnedIds={new Set(pinnedFeatures.map((f) => f.id))}
          onAdd={(f) => { pin(f.id); closePicker(); }}
          onClose={closePicker}
        />
      )}

      {/* One bank, left-aligned: what shapes the context, a star, then what
          happens to it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--ins-edge)] pt-2.5 -mx-1.5">
        <PromptToolbar
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={onSelectTemplate}
          onManageTemplates={onManageTemplates}
          templateDropdownOpen={templateDropdownOpen}
          onTemplateDropdownOpenChange={onTemplateDropdownOpenChange}
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
          // Always laid out, only shown on focus: toggling display on focus
          // left WebKitGTK repainting the pane legend's keycap partially.
          className="tui-pane-info left-[10px] right-auto flex invisible items-center gap-[9px] group-focus-within/ctx:visible"
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

// `+ add feature`: filter the map by name or alias, ↑ ↓ to move, Enter pins,
// Esc closes. Already pinned features are left out.
function FeaturePicker({ features, pinnedIds, onAdd, onClose }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return features.filter((f) => f?.id && !pinnedIds.has(f.id)
      && (!q || [f.name, f.id, ...(Array.isArray(f.aliases) ? f.aliases : [])].some((w) => String(w ?? '').toLowerCase().includes(q))));
  }, [features, pinnedIds, query]);
  const at = Math.min(cursor, shown.length - 1);
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') setCursor(Math.min(at + 1, shown.length - 1));
    else if (e.key === 'ArrowUp') setCursor(Math.max(at - 1, 0));
    else if (e.key === 'Enter') { if (shown[at]) onAdd(shown[at]); }
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div className="edge-engraved -mx-1.5 flex flex-col" onKeyDown={onKeyDown}>
      <input
        autoFocus
        value={query}
        onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
        onBlur={(e) => { if (!e.currentTarget.parentElement.contains(e.relatedTarget)) onClose(); }}
        placeholder="add feature · filter by name or alias"
        aria-label="Filter features by name or alias"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={shown[at] ? `${listId}-${at}` : undefined}
        className="h-7 px-3 bg-transparent font-mono text-[12px] text-foreground placeholder:text-muted-foreground border-b border-[var(--ins-edge)] focus:outline-none"
      />
      <div id={listId} role="listbox" aria-label="Features" className="max-h-40 overflow-y-auto py-1">
        {shown.length === 0 ? (
          <p className="px-3.5 py-1 font-mono text-[11px] text-muted-foreground">no feature matches</p>
        ) : shown.map((f, i) => (
          <PickerRow
            key={f.id}
            id={`${listId}-${i}`}
            tabIndex={-1}
            glyph={i === at ? '›' : ''}
            name={String(f.name || f.id)}
            path={Array.isArray(f.aliases) ? f.aliases.join(', ') : ''}
            tag={plural(Array.isArray(f.files) ? f.files.length : 0, 'file')}
            selected={i === at}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAdd(f)}
          />
        ))}
      </div>
    </div>
  );
}

// One kind of context: a printed label in a fixed column, its items beside it.
function ManifestRow({ label, children }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-4">
      <dt className="ins-legend h-5 flex items-center text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// FIG.32's fallback: files as a tally by intent, once there are too many to
// list and the files pane shows them: `12 files: 8 EDIT · 3 READ · 1 COPY · listed in the files pane`,
// or `19 files, all EDIT · listed in the files pane` when they share one intent.
// Plain text: only chips are boxed, because only chips respond.
function FileTally({ selectedFiles, fileStates }) {
  const total = selectedFiles?.size || 0;
  const counts = {};
  selectedFiles?.forEach((path) => {
    const state = fileStates?.get(path) || 'modify';
    counts[state] = (counts[state] || 0) + 1;
  });
  const parts = FILE_STATE_ORDER.filter((s) => counts[s]);
  const tone = (state) => (state === 'modify' ? 'text-foreground' : TALLY_TONE[state]);
  if (parts.length === 1) {
    const [state] = parts;
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 min-h-5 text-[11px] font-mono">
        <span className="text-foreground">{total} files, all</span>
        <span className={cn("tracking-[0.08em]", tone(state))}>{FILE_STATE_LABELS[state]}</span>
        <span className="text-faint" aria-hidden="true">·</span>
        <span className="text-muted-foreground">listed in the files pane</span>
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 min-h-5 text-[11px] font-mono">
      <span className="text-foreground">{total} files:</span>
      {parts.map((state, i) => (
        <span key={state} className="inline-flex items-center gap-x-1.5">
          {i > 0 && <span className="text-faint" aria-hidden="true">·</span>}
          <span className="text-foreground">{counts[state]}</span>
          <span className={cn("tracking-[0.08em]", tone(state))}>
            {FILE_STATE_LABELS[state]}
          </span>
        </span>
      ))}
      <span className="text-faint" aria-hidden="true">·</span>
      <span className="text-muted-foreground">listed in the files pane</span>
    </p>
  );
}

// The chips' intent colours, as text only.
const TALLY_TONE = Object.fromEntries(
  Object.entries(MODE_TOKENS).map(([state, cls]) => [state, cls.split(' ').filter((c) => c.startsWith('text-')).join(' ')]),
);
