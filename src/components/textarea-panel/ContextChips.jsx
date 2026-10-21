import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { basename, getRelativePath } from "../../utils/pathUtils";
import { MODE_TOKENS, FILE_STATE_LABELS, FILE_STATE_ORDER } from "./FileStateSelector";

const CHIP = "inline-flex items-center h-4 shrink-0 max-w-full edge-engraved text-[10px] font-mono leading-none";
const REMOVE = "flex items-center justify-center h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * The prompt's attached context as removable chips: files (with their
 * EDIT/READ/COPY state, click to cycle) and picked code elements.
 */
export function ContextChips({
  selectedFiles,
  fileStates,
  selectedElements,
  currentPath,
  onSetFileState,
  onRemoveFile,
  onRemoveElement,
}) {
  const files = useMemo(() => Array.from(selectedFiles || []).map((abs) => ({
    abs,
    name: basename(abs),
    rel: getRelativePath(abs, currentPath),
  })), [selectedFiles, currentPath]);

  const elements = useMemo(() => {
    const out = [];
    selectedElements?.forEach((els, filePath) => {
      const rel = getRelativePath(filePath, currentPath);
      els.forEach((el) => out.push({ filePath, rel, el }));
    });
    return out;
  }, [selectedElements, currentPath]);

  if (files.length === 0 && elements.length === 0) {
    return (
      <p className="px-1 text-[10px] font-mono text-muted-foreground">
        No context. Select files in the sidebar or type @ to mention one.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-1 max-h-[76px] overflow-y-auto" aria-label="Context attached to the prompt">
      {files.map(({ abs, name, rel }) => {
        const state = fileStates?.get(abs) || 'modify';
        const next = FILE_STATE_ORDER[(FILE_STATE_ORDER.indexOf(state) + 1) % FILE_STATE_ORDER.length];
        return (
          <li key={abs} className={CHIP} title={rel}>
            <button
              type="button"
              onClick={() => onSetFileState?.(abs, next)}
              disabled={!onSetFileState}
              aria-label={`${name}: ${FILE_STATE_LABELS[state]}. Change to ${FILE_STATE_LABELS[next]}`}
              className={cn("h-4 px-1 font-semibold tracking-[0.08em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", MODE_TOKENS[state])}
            >
              {FILE_STATE_LABELS[state]}
            </button>
            <span className="px-1 truncate text-foreground/80">{name}</span>
            {onRemoveFile && (
              <button type="button" onClick={() => onRemoveFile(abs)} aria-label={`Remove ${name} from context`} className={REMOVE}>
                ×
              </button>
            )}
          </li>
        );
      })}
      {elements.map(({ filePath, rel, el }) => {
        const lines = el.line === el.endLine ? `${el.line}` : `${el.line}-${el.endLine}`;
        return (
          <li key={`${filePath}:${el.key}`} className={CHIP} title={`${rel}:${lines} (${el.type})`}>
            <span className="pl-1 text-muted-foreground">{el.type}</span>
            <span className="px-1 truncate text-foreground/80">{el.displayName}</span>
            {onRemoveElement && (
              <button type="button" onClick={() => onRemoveElement(filePath, el.key)} aria-label={`Remove ${el.displayName} from context`} className={REMOVE}>
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
