import { Puzzle, Check } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";

export function PatternsSelector({ patternFiles, selectedPatterns, onTogglePattern }) {
  const selectedCount = selectedPatterns.size;

  if (patternFiles.length === 0) return null;

  const tooltipText = selectedCount > 0
    ? Array.from(selectedPatterns).map(f => f.replace(/\.md$/, '')).join(', ')
    : 'Enforce patterns';

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Enforce patterns"
              className="relative"
            >
              <Puzzle className={`h-3 w-3 ${selectedCount > 0 ? 'text-primary' : ''}`} />
              {selectedCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none px-0.5">
                  {selectedCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="text-xs">{tooltipText}</span>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" side="top" className="w-52 text-xs">
        {patternFiles.map((filename) => {
          const isSelected = selectedPatterns.has(filename);
          return (
            <DropdownMenuItem
              key={filename}
              onClick={(e) => { e.preventDefault(); onTogglePattern(filename); }}
              className={`flex items-center justify-between text-[10px] py-1.5 ${isSelected ? 'bg-primary/10' : ''}`}
            >
              <span className="truncate pr-2">{filename.replace(/\.md$/, '')}</span>
              <Check className={`h-3 w-3 flex-shrink-0 ${isSelected ? 'text-primary' : 'invisible'}`} />
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={selectedCount === 0}
          onClick={(e) => { e.preventDefault(); selectedPatterns.forEach(p => onTogglePattern(p)); }}
          className="text-[10px] py-1.5 text-muted-foreground"
        >
          Clear all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
