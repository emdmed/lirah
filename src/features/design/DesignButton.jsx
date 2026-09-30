import { Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RetroSpinner } from '@/components/ui/RetroSpinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Opens the Design View. While an extraction is running the button becomes a
 * live badge — the run outlives the dialog, so the toolbar is where you see that
 * it is still going.
 */
export function DesignButton({ onClick, isRunning, hasSpec, disabled }) {
  if (isRunning) {
    return (
      <Badge variant="outline" size="icon" onClick={onClick} className="cursor-pointer">
        <RetroSpinner size={12} lineWidth={1.5} />
        Design
      </Badge>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          onClick={onClick}
          disabled={disabled}
          className={`gap-1 px-1.5 ${hasSpec ? 'text-primary' : ''}`}
        >
          <Network className="h-3 w-3" />
          design
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        <span className="text-xs">
          {hasSpec ? 'Open design diagram' : 'Diagram this conversation'}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
