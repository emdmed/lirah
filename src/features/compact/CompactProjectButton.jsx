import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RetroSpinner } from "@/components/ui/RetroSpinner";
import { Layers, Scan, Zap, Sparkles, FileX } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Button to compact all parseable files in the project
 * @param {Function} onClick - Handler when button is clicked
 * @param {boolean} isCompacting - Whether compacting is in progress
 * @param {{ current: number, total: number, phase: string } | null} progress - Progress data
 * @param {boolean} disabled - Whether button is disabled
 */
export function CompactProjectButton({ onClick, isCompacting, progress, disabled }) {
  const phase = progress?.phase || 'scanning';
  const progressText = progress && progress.total > 0
    ? `${progress.current}/${progress.total}`
    : '';

  const getPhaseConfig = () => {
    switch (phase) {
      case 'scanning':
        return { Icon: Scan, iconClass: 'animate-pulse', text: 'Scanning...' };
      case 'parsing':
        return { Icon: Zap, iconClass: 'animate-bounce', text: progressText };
      case 'finishing':
        return { Component: RetroSpinner, props: { size: 12, lineWidth: 1.5 }, text: 'Finishing...' };
      case 'empty':
        return { Icon: FileX, iconClass: '', text: 'No files' };
      default:
        return { Icon: Scan, iconClass: 'animate-pulse', text: 'Processing...' };
    }
  };

  const config = getPhaseConfig();

  if (isCompacting) {
    return (
      <Badge
        variant="outline"
        size="icon"
      >
        {config.Component ? (
          <config.Component {...config.props} />
        ) : (
          <config.Icon className={`h-3 w-3 ${config.iconClass}`} />
        )}
        {config.text}
      </Badge>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
        >
          <Layers className="h-3 w-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        <span className="text-xs">
          Compact whole project
          <kbd className="ml-2 px-1 py-0.5 bg-muted border border-sketch rounded text-xs">
            Ctrl+Shift+P
          </kbd>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
