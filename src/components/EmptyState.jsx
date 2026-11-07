import React from 'react';
import { Button } from './ui/button';

// Empty-orbit plate shared by every empty state: a faint dashed orbit with an
// empty body on it, an italic line, an optional mono note and the key that
// fills it. SVG so the global radius reset can't square the ellipse.
export function EmptyPlate({ title, description, action, className = '' }) {
  return (
    <div className={`ins-empty ${className}`}>
      <svg className="ins-empty-orbit" width="34" height="16" viewBox="0 0 34 16" aria-hidden="true">
        <g transform="rotate(-20 17 8)" fill="none" stroke="currentColor" strokeWidth="1">
          <ellipse cx="17" cy="8" rx="15" ry="5" strokeDasharray="2 2" />
          <circle cx="28.5" cy="4.8" r="2.5" />
        </g>
      </svg>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <p className="ins-name ins-empty-line">{title}</p>
        {description && <p>{description}</p>}
        {action && (
          <Button variant="outline" size="xs" className="mt-1" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}

// `icon` is accepted for existing callers but not drawn.
export function EmptyState({ icon: _icon, title, description, action, className = '' }) {
  return <EmptyPlate title={title} description={description} action={action} className={className} />;
}
