import React from 'react';
import { Button } from './ui/button';
import { KeyChord } from './instrument/Keycap';

// Empty-orbit plate shared by every empty state, centred: a faint dashed
// orbit tilted -11deg with a faint centre and an empty body on it, an italic
// line, an optional mono note and the key that fills it (`keys` + `keyLabel`).
// SVG so the global radius reset can't square the ellipse.
export function EmptyPlate({ title, description, keys, keyLabel, action, className = '' }) {
  return (
    <div className={`ins-empty ${className}`}>
      <svg className="ins-empty-orbit" width="120" height="44" viewBox="0 0 120 44" aria-hidden="true">
        <g transform="rotate(-11 60 22)">
          <ellipse cx="60" cy="22" rx="52" ry="18.7" fill="none" stroke="currentColor" strokeWidth="0.7" strokeDasharray="3 3" />
          <circle cx="60" cy="22" r="2" fill="currentColor" />
          <circle cx="86" cy="38.2" r="4" fill="var(--pane-bg, var(--ins-panel))" stroke="var(--color-muted-foreground)" strokeWidth="0.8" />
        </g>
      </svg>
      <p className="ins-name ins-empty-line">{title}</p>
      {description && <p className="ins-empty-note">{description}</p>}
      {keys && (
        <p className="ins-empty-key">
          <KeyChord keys={keys} size="sm" /> {keyLabel}
        </p>
      )}
      {action && (
        <Button variant="outline" size="xs" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

// `icon` is accepted for existing callers but not drawn.
export function EmptyState({ icon: _icon, ...props }) {
  return <EmptyPlate {...props} />;
}
