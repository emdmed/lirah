import React from 'react';
import { Button } from './ui/button';

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className = '' 
}) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
      {Icon && (
        <Icon className="w-12 h-12 text-muted-foreground/30 mb-4" />
      )}
      <p className="text-base font-medium text-foreground mb-2">
        {title}
      </p>
      {description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-xs">
          {description}
        </p>
      )}
      {action && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
