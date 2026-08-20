import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown, X, CaseSensitive, Regex } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Search over the terminal's scrollback, driven by xterm's search addon.
 * Mounted over the terminal (its wrapper is position:relative) so it doesn't
 * reflow the viewport — a resize would make the PTY repaint mid-search.
 *
 * @param {object} searchAddon - the SearchAddon instance for this terminal
 * @param {object} decorations - highlight colors; also what makes the addon
 *   report match counts, so this is not optional in practice
 * @param {function} onClose - close and return focus to the terminal
 */
export function TerminalSearchBar({ searchAddon, decorations, onClose }) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [results, setResults] = useState({ index: -1, count: 0 });
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // The addon reports match counts asynchronously as it walks the buffer.
  useEffect(() => {
    if (!searchAddon?.onDidChangeResults) return;
    const disposable = searchAddon.onDidChangeResults((r) => {
      if (!r) return;
      setResults({ index: r.resultIndex ?? -1, count: r.resultCount ?? 0 });
    });
    return () => disposable?.dispose?.();
  }, [searchAddon]);

  const options = { caseSensitive, regex, incremental: false, decorations };

  const find = useCallback(
    (direction, term = query) => {
      if (!searchAddon || !term) {
        setResults({ index: -1, count: 0 });
        return;
      }
      try {
        setInvalid(false);
        if (direction === 'prev') searchAddon.findPrevious(term, options);
        else searchAddon.findNext(term, options);
      } catch {
        // Only reachable with regex mode on and a half-typed pattern.
        setInvalid(true);
      }
    },
    [searchAddon, query, caseSensitive, regex, decorations]
  );

  // Re-run on every keystroke and whenever a modifier flips, so the match count
  // tracks what's in the box.
  useEffect(() => {
    if (!query) {
      setResults({ index: -1, count: 0 });
      setInvalid(false);
      searchAddon?.clearDecorations?.();
      return;
    }
    find('next', query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, regex]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      find(e.shiftKey ? 'prev' : 'next');
    }
  };

  const counter = invalid
    ? 'bad pattern'
    : results.count > 0
    ? `${results.index + 1}/${results.count}`
    : query
    ? 'no matches'
    : '';

  return (
    <div className="absolute right-3 top-1 z-30 flex items-center gap-1 rounded-sm border border-sketch bg-background/95 px-1.5 py-1 shadow-sm backdrop-blur">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search output"
        className="h-6 w-44 bg-transparent px-1 font-mono text-xs focus:outline-none"
      />
      <span
        className={cn(
          'w-16 shrink-0 text-right font-mono text-[10px] tabular-nums',
          invalid || (query && !results.count) ? 'text-destructive/80' : 'text-muted-foreground'
        )}
      >
        {counter}
      </span>

      <ToggleButton active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} title="Match case">
        <CaseSensitive className="h-3 w-3" />
      </ToggleButton>
      <ToggleButton active={regex} onClick={() => setRegex((v) => !v)} title="Regular expression">
        <Regex className="h-3 w-3" />
      </ToggleButton>

      <IconButton onClick={() => find('prev')} title="Previous match (Shift+Enter)">
        <ChevronUp className="h-3 w-3" />
      </IconButton>
      <IconButton onClick={() => find('next')} title="Next match (Enter)">
        <ChevronDown className="h-3 w-3" />
      </IconButton>
      <IconButton onClick={onClose} title="Close (Esc)">
        <X className="h-3 w-3" />
      </IconButton>
    </div>
  );
}

function IconButton({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
    >
      {children}
    </button>
  );
}

function ToggleButton({ active, onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-sm cursor-pointer transition-colors',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
