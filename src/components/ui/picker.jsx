import { forwardRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ContextMoon } from '@/components/instrument/ContextMoon';
import { useTabManager } from '@/features/tabs/TabContext';
import { getTabContextFill } from '@/features/tabs/tabContextFill';

// Shared row grammar for pickers and palettes: one line per item.
//
//   › ↵  medprotocol-core   ~/projects/medprotocol-core   ◐ tab 1
//
// glyph column, name, dimmed path, trailing tag. The keyboard cursor is
// .ins-row-selected (tint plus a lamp-coloured ›).

// /home/me/x → ~/x. Display only; the real path is what gets opened.
export function tildePath(path) {
  if (!path) return path;
  return path.replace(/^(\/home\/[^/]+|\/Users\/[^/]+)(?=\/|$)/, '~');
}

export const PickerRow = forwardRef(function PickerRow(
  { glyph, name, path, tag, selected, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        'relative grid w-full min-w-0 grid-cols-[16px_minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-2.5 py-1 pl-3.5 pr-2 text-left font-mono text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        selected ? 'ins-row-selected' : 'hover:bg-foreground/5',
        className,
      )}
      {...props}
    >
      <span className="text-center text-xs text-[var(--ins-faint)]" aria-hidden="true">{glyph}</span>
      <span className={cn('truncate', selected ? 'text-foreground' : 'text-foreground/90')}>{name}</span>
      <span className="truncate text-xs text-muted-foreground">{path}</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">{tag}</span>
    </button>
  );
});

// Open tabs by project path: path → { id, number } (number is 1-based).
export function useOpenTabsByPath() {
  const { tabs } = useTabManager();
  return useMemo(() => {
    const map = new Map();
    tabs.forEach((t, i) => {
      if (t.projectPath && !map.has(t.projectPath)) map.set(t.projectPath, { id: t.id, number: i + 1 });
    });
    return map;
  }, [tabs]);
}

// The tag for a project that already has a tab: that tab's context moon and
// its number, so you can tell you're about to open a second copy.
export function OpenTabTag({ tab }) {
  if (!tab) return null;
  return (
    <>
      <ContextMoon ratio={getTabContextFill(tab.id)} size={11} />
      <span>tab {tab.number}</span>
    </>
  );
}
