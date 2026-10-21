import { useEffect, useRef } from 'react';

// Inline rename: Enter commits, Escape cancels, blur commits. An empty name
// (or the automatic one) goes back to automatic naming.
export function RenameField({ initial, onCommit, onCancel }) {
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(ref.current?.value ?? '');
    else onCancel();
  };
  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Tab name"
      spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="ins-well h-5 min-w-0 flex-1 px-1 text-xs text-foreground outline-none"
    />
  );
}
