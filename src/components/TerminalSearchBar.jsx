import { useState, useEffect, useRef, useCallback } from 'react';
import { CaseSensitive, Regex } from 'lucide-react';
import { FloatPane } from './ui/float-pane';
import { shortcutKeys } from '../lib/shortcuts';

const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_KEYS = shortcutKeys('terminal-search');
const HINTS = [
  { keys: ['↵'], label: 'next' },
  { keys: ['⇧', '↵'], label: 'prev' },
];

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
  const debounceRef = useRef(0);

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

  // Re-run as the query or a modifier changes, so the match count tracks what's
  // in the box — debounced, since each run walks the whole scrollback.
  useEffect(() => {
    if (!query) {
      setResults({ index: -1, count: 0 });
      setInvalid(false);
      searchAddon?.clearDecorations?.();
      return;
    }
    debounceRef.current = setTimeout(() => find('next', query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, regex]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Search now; the pending debounced run would step past this match.
      clearTimeout(debounceRef.current);
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
    <FloatPane
      title="search"
      keys={SEARCH_KEYS}
      status={counter ? (
        <span className={invalid || (query && !results.count) ? 'text-[var(--ins-fault)]' : undefined}>{counter}</span>
      ) : undefined}
      hints={HINTS}
      className="absolute right-2 top-2 z-30 w-72 px-2"
    >
      <div className="flex items-center gap-1 pt-1 pb-1.5">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="search output"
          aria-label="Search terminal output"
          className="ins-well h-6 min-w-0 flex-1 px-1.5 font-mono text-xs outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1"
        />
        <ToggleButton active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} title="Match case">
          <CaseSensitive className="h-3 w-3" />
        </ToggleButton>
        <ToggleButton active={regex} onClick={() => setRegex((v) => !v)} title="Regular expression">
          <Regex className="h-3 w-3" />
        </ToggleButton>
        <button
          type="button"
          onClick={onClose}
          className="ins-cap ins-round"
          data-size="sm"
          aria-label="Close search (Esc)"
          title="Close (Esc)"
        >
          esc
        </button>
      </div>
    </FloatPane>
  );
}

function ToggleButton({ active, onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-icon-only
      className="ins-key ins-key-panel ins-round"
    >
      {children}
    </button>
  );
}
