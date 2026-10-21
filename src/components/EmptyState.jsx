import React from 'react';
import { Button } from './ui/button';

// A sentence in the serif voice, then a comment and a bracketed action in mono.
// `icon` is accepted for existing callers but not drawn.
export function EmptyState({
  icon: _icon,
  title,
  description,
  action,
  className = ''
}) {
  return (
    <div className={`flex flex-col items-start gap-1 px-2 py-3 text-xs ${className}`}>
      <p className="ins-voice text-foreground">{title}</p>
      {description && (
        <p className="text-muted-foreground"># {description}</p>
      )}
      {action && (
        <Button
          variant="outline"
          size="xs"
          className="mt-1"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
