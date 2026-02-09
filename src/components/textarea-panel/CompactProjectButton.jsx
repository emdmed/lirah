import React from "react";
import { Button } from "../ui/button";
import { Layers, Scan, Zap, Sparkles, FileX } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Helper to convert hex to rgba for backgrounds
 */
const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Button to compact all parseable files in the project
 * @param {Function} onClick - Handler when button is clicked
 * @param {boolean} isCompacting - Whether compacting is in progress
 * @param {{ current: number, total: number, phase: string } | null} progress - Progress data
 * @param {boolean} disabled - Whether button is disabled
 */
export function CompactProjectButton({ onClick, isCompacting, progress, disabled }) {
  const { theme } = useTheme();
  const phase = progress?.phase || 'scanning';
  const progressText = progress && progress.total > 0
    ? `${progress.current}/${progress.total}`
    : '';

  // Get theme colors for each phase
  const colors = theme?.terminal || {};
  const scanningColor = colors.cyan || colors.brightCyan || '#22d3ee';
  const parsingColor = colors.yellow || colors.brightYellow || '#fbbf24';
  const finishingColor = colors.green || colors.brightGreen || '#34d399';
  const emptyColor = colors.red || colors.brightRed || '#f87171';

  // Different styles and content based on phase
  const getPhaseConfig = () => {
    switch (phase) {
      case 'scanning':
        return {
          color: scanningColor,
          Icon: Scan,
          iconClass: 'animate-pulse',
          text: 'Scanning...',
        };
      case 'parsing':
        return {
          color: parsingColor,
          Icon: Zap,
          iconClass: 'animate-bounce',
          text: progressText,
        };
      case 'finishing':
        return {
          color: finishingColor,
          Icon: Sparkles,
          iconClass: 'animate-spin',
          text: 'Finishing...',
        };
      case 'empty':
        return {
          color: emptyColor,
          Icon: FileX,
          iconClass: '',
          text: 'No files',
        };
      default:
        return {
          color: scanningColor,
          Icon: Scan,
          iconClass: 'animate-pulse',
          text: 'Processing...',
        };
    }
  };

  const config = getPhaseConfig();

  const activeStyle = isCompacting ? {
    color: config.color,
    backgroundColor: hexToRgba(config.color, 0.1),
    borderColor: hexToRgba(config.color, 0.3),
    borderWidth: '1px',
    borderStyle: 'solid',
  } : {};

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClick}
          disabled={disabled || isCompacting}
          className={`transition-all duration-300 ${isCompacting
              ? 'animate-pulse'
              : 'text-muted-foreground hover:text-foreground'
            }`}
          style={activeStyle}
        >
          {isCompacting ? (
            <>
              <config.Icon className={`h-3 w-3 mr-1.5 ${config.iconClass}`} />
              <span className="text-xs font-mono font-medium">
                {config.text}
              </span>
            </>
          ) : (
            <Layers className="h-3 w-3" />
          )}
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
