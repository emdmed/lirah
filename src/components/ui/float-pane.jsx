import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { PaneLegend } from '@/components/instrument/PaneLegend';
import { FrameHints, joinKeys } from '@/components/instrument/FrameHints';

// A pane floating over its anchor, drawn like a dialog but not modal: it
// doesn't trap focus or dim the app. Use it for popups that belong to
// something (the prompt's file list, terminal search, the `:` suggestions);
// use Dialog for anything centred that should take over.
//
//   ┌─ ^⇧F SEARCH ✦ ─────── 3/41 ┐
//   │ body                        │
//   └──── ↵ next ✦ ⇧↵ prev ✦ esc close┘
//
// keys    shortcut that opens it, as a lit keycap in the legend
// lamp    'on' (default) | 'ok' | 'warn' | 'fault'
// status  text in the top-right corner of the frame
// hints   [{ keys, label }] set into the bottom frame line
export const FloatPane = forwardRef(function FloatPane(
  { title, keys, lamp = 'on', status, hints, className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('tui-pane tui-float', className)}
      data-float
      data-legend
      {...props}
    >
      <PaneLegend
        index={keys?.length ? joinKeys(keys) : undefined}
        title={title}
        lit
        lamp={lamp}
        trailing={status != null ? <span className="tui-frame-status-inline">{status}</span> : undefined}
      />
      {children}
      {hints?.length > 0 && (
        <span className="tui-pane-info tui-frame-hints">
          <FrameHints hints={hints} />
        </span>
      )}
    </div>
  );
});
