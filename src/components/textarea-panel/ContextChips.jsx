import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { basename, getRelativePath } from "../../utils/pathUtils";
import { MODE_TOKENS, FILE_STATE_LABELS, FILE_STATE_ORDER } from "./FileStateSelector";

const NO_EXTRAS = [];
const CHIP = "inline-flex items-center shrink-0 max-w-full edge-engraved font-mono leading-none";
// sm: the prompt box. md: the context pane, where the tag (click to cycle)
// and the × sit side by side and need 20px to be hit apart.
const SIZES = {
  sm: { chip: "h-4 text-[10px]", tag: "h-4 px-1", remove: "h-4 w-4", list: "max-h-[76px]" },
  md: { chip: "h-5 text-[11px]", tag: "h-5 px-1.5", remove: "h-5 w-5 text-[13px]", list: "max-h-[68px]" },
};
// EDIT is the default intent: printed in ink, so colour marks only the
// files that differ from it.
const DEFAULT_STATE = 'modify';
const DEFAULT_TAG = 'text-foreground';
const REMOVE = "flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * The prompt's attached context as removable chips: files (with their
 * EDIT/READ/COPY state, click to cycle) and picked code elements. `extras`
 * adds other things the prompt carries ({ key, tag, name, title, onRemove }:
 * linked repos, the instruction template, patterns), so the list can be the
 * whole manifest.
 */
export function ContextChips({
  selectedFiles,
  fileStates,
  selectedElements,
  currentPath,
  onSetFileState,
  onRemoveFile,
  onRemoveElement,
  extras = NO_EXTRAS,
  size = "sm",
}) {
  const sz = SIZES[size];
  // Grouped by intent (EDIT, then READ, then COPY), selection order within.
  const files = useMemo(() => Array.from(selectedFiles || [])
    .map((abs) => ({
      abs,
      name: basename(abs),
      rel: getRelativePath(abs, currentPath),
      state: fileStates?.get(abs) || DEFAULT_STATE,
    }))
    .sort((a, b) => FILE_STATE_ORDER.indexOf(a.state) - FILE_STATE_ORDER.indexOf(b.state)),
  [selectedFiles, fileStates, currentPath]);

  const elements = useMemo(() => {
    const out = [];
    selectedElements?.forEach((els, filePath) => {
      const rel = getRelativePath(filePath, currentPath);
      els.forEach((el) => out.push({ filePath, rel, el }));
    });
    return out;
  }, [selectedElements, currentPath]);

  if (files.length === 0 && elements.length === 0 && extras.length === 0) {
    return (
      <p className="px-1 text-[10px] font-mono text-muted-foreground">
        No context. Select files in the sidebar or type @ to mention one.
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-wrap gap-1 overflow-y-auto", sz.list)} aria-label="Context attached to the prompt">
      {files.map(({ abs, name, rel, state }) => {
        const next = FILE_STATE_ORDER[(FILE_STATE_ORDER.indexOf(state) + 1) % FILE_STATE_ORDER.length];
        return (
          <li key={abs} className={cn(CHIP, sz.chip)} title={rel}>
            <button
              type="button"
              onClick={() => onSetFileState?.(abs, next)}
              disabled={!onSetFileState}
              aria-label={`${name}: ${FILE_STATE_LABELS[state]}. Change to ${FILE_STATE_LABELS[next]}`}
              title={onSetFileState ? `${FILE_STATE_LABELS[state]} · click to cycle ${FILE_STATE_ORDER.map((s) => FILE_STATE_LABELS[s]).join(' → ')}` : undefined}
              className={cn(sz.tag, "font-semibold tracking-[0.08em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", state === DEFAULT_STATE ? DEFAULT_TAG : MODE_TOKENS[state])}
            >
              {FILE_STATE_LABELS[state]}
            </button>
            <span className="px-1 truncate text-foreground">{name}</span>
            {onRemoveFile && (
              <button type="button" onClick={() => onRemoveFile(abs)} aria-label={`Remove ${name} from context`} className={cn(REMOVE, sz.remove)}>
                ×
              </button>
            )}
          </li>
        );
      })}
      {elements.map(({ filePath, rel, el }) => {
        const lines = el.line === el.endLine ? `${el.line}` : `${el.line}-${el.endLine}`;
        return (
          <li key={`${filePath}:${el.key}`} className={cn(CHIP, sz.chip)} title={`${rel}:${lines} (${el.type})`}>
            <span className="pl-1 text-muted-foreground">{el.type}</span>
            <span className="px-1 truncate text-foreground">{el.displayName}</span>
            {onRemoveElement && (
              <button type="button" onClick={() => onRemoveElement(filePath, el.key)} aria-label={`Remove ${el.displayName} from context`} className={cn(REMOVE, sz.remove)}>
                ×
              </button>
            )}
          </li>
        );
      })}
      {extras.map(({ key, tag, name, title, onRemove }) => (
        <li key={key} className={cn(CHIP, sz.chip)} title={title || name}>
          <span className="pl-1 text-muted-foreground">{tag}</span>
          <span className="px-1 truncate text-foreground">{name}</span>
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove ${name} from context`} className={cn(REMOVE, sz.remove)}>
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
