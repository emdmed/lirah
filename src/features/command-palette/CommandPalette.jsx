import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../toast';

const MAX_SUGGESTIONS = 8;

/**
 * Vim-style command line. `commands` is a list of
 *   { id, aliases?, hint, options?: string[] | () => string[], run(arg) }
 * A command with `options` takes one argument, which the line completes from
 * that list (`:theme gru` → `:theme gruvbox`).
 */
export function CommandPalette({ open, onClose, commands }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const returnFocusRef = useRef(null);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement;
    setText('');
    setSelected(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const [name, ...rest] = text.trimStart().split(/\s+/);
  const arg = rest.join(' ');
  const typingArg = /\s/.test(text.trimStart());
  const exact = commands.find((c) => c.id === name || c.aliases?.includes(name));

  // Either commands matching the first word, or the argument choices of the
  // command already typed.
  const suggestions = useMemo(() => {
    if (typingArg && exact?.options) {
      const opts = typeof exact.options === 'function' ? exact.options() : exact.options;
      const q = arg.toLowerCase();
      return opts
        .filter((o) => o.toLowerCase().includes(q))
        .sort((a, b) => Number(!a.startsWith(q)) - Number(!b.startsWith(q)))
        .slice(0, MAX_SUGGESTIONS)
        .map((o) => ({ key: `${exact.id} ${o}`, label: o, hint: exact.hint, command: exact, arg: o }));
    }
    const q = (name || '').toLowerCase();
    return commands
      .filter((c) => !q || c.id.includes(q) || c.aliases?.some((a) => a.includes(q)))
      .sort((a, b) => Number(!a.id.startsWith(q)) - Number(!b.id.startsWith(q)))
      .slice(0, MAX_SUGGESTIONS)
      .map((c) => ({ key: c.id, label: c.id, hint: c.hint, command: c, arg: null }));
  }, [commands, name, arg, typingArg, exact]);

  useEffect(() => {
    setSelected((i) => Math.min(i, Math.max(0, suggestions.length - 1)));
  }, [suggestions.length]);

  if (!open) return null;

  const dismiss = () => {
    onClose();
    returnFocusRef.current?.focus?.({ preventScroll: true });
  };

  const run = (command, value) => {
    onClose();
    returnFocusRef.current?.focus?.({ preventScroll: true });
    Promise.resolve()
      .then(() => command.run(value))
      .catch((err) => toast.error(`:${command.id} failed: ${err?.message || err}`));
  };

  const complete = (s) => {
    if (!s) return;
    setText(s.arg != null ? `${s.command.id} ${s.arg}` : `${s.command.id}${s.command.options ? ' ' : ''}`);
    setSelected(0);
  };

  const submit = () => {
    const s = suggestions[selected];
    if (exact && (!exact.options || arg)) {
      // Typed in full: run as typed, but prefer the highlighted choice so a
      // partial argument (`:theme gru`) resolves to the completed one.
      run(exact, typingArg && s?.arg != null ? s.arg : arg || undefined);
      return;
    }
    if (!s) {
      toast.error(`not a command: ${name}`);
      dismiss();
      return;
    }
    if (s.arg != null) run(s.command, s.arg);
    else if (s.command.options) complete(s);
    else run(s.command);
  };

  const onKeyDown = (e) => {
    switch (e.key) {
      case 'Escape':
        dismiss();
        break;
      case 'Enter':
        submit();
        break;
      case 'Tab':
        complete(suggestions[selected]);
        break;
      case 'ArrowDown':
        setSelected((i) => (suggestions.length ? (i + 1) % suggestions.length : 0));
        break;
      case 'ArrowUp':
        setSelected((i) => (suggestions.length ? (i - 1 + suggestions.length) % suggestions.length : 0));
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="fixed left-0 right-0 bottom-0 z-[110] flex flex-col font-mono text-xs">
      {suggestions.length > 0 && (
        <div className="tui-pane mx-1 px-1 max-w-xl" data-title="commands">
          <ul role="listbox">
            {suggestions.map((s, i) => (
              <li
                key={s.key}
                role="option"
                aria-selected={i === selected}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelected(i);
                  if (s.arg != null || !s.command.options) run(s.command, s.arg ?? undefined);
                  else complete(s);
                }}
                className={`flex items-center gap-3 px-1.5 h-5 cursor-pointer ${i === selected ? 'bg-foreground text-background' : 'hover:bg-foreground/10'}`}
              >
                <span className="shrink-0 w-24">{s.arg != null ? `${s.command.id} ${s.label}` : s.label}</span>
                <span className={`truncate min-w-0 ${i === selected ? '' : 'text-muted-foreground'}`}>{s.hint}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center h-8 px-2 bg-[var(--tui-bar)] shadow-[inset_0_1px_0_0_var(--tui-line)]">
        <span className="text-primary select-none">:</span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={dismiss}
          spellCheck={false}
          aria-label="Command"
          className="flex-1 bg-transparent outline-none focus-visible:outline-none border-0 px-0.5 text-xs"
        />
        <span className="text-muted-foreground select-none">
          <span className="tui-key">tab</span> complete · <span className="tui-key">↵</span> run · <span className="tui-key">esc</span> close
        </span>
      </div>
    </div>
  );
}
