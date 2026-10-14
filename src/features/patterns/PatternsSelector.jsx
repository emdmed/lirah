import { Puzzle, Check } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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
              variant="ghost"
              size="xs"
              aria-label="Enforce patterns"
              className={`gap-1 px-1.5 ${selectedCount > 0 ? 'text-[var(--ins-lamp)]' : ''}`}
            >
              <Puzzle className="h-3 w-3" />
              patterns{selectedCount > 0 && <span className="tube">:{selectedCount}</span>}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="text-xs">{tooltipText}</span>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" side="top" className="w-52 text-xs">
        {(() => {
          const groups = {};
          const rootFiles = [];
          patternFiles.forEach((filename) => {
            const slashIdx = filename.indexOf('/');
            if (slashIdx === -1) {
              rootFiles.push(filename);
            } else {
              const dir = filename.slice(0, slashIdx);
              if (!groups[dir]) groups[dir] = [];
              groups[dir].push(filename);
            }
          });
          return (
            <>
              {rootFiles.map((filename) => {
                const isSelected = selectedPatterns.has(filename);
                return (
                  <DropdownMenuItem
                    key={filename}
                    onClick={(e) => { e.preventDefault(); onTogglePattern(filename); }}
                    className={`flex items-center justify-between text-[11px] py-1.5 pl-3 ${isSelected ? 'ins-row-selected' : ''}`}
                  >
                    <span className="truncate pr-2">{filename.replace(/\.md$/, '')}</span>
                    <Check className={`h-3 w-3 flex-shrink-0 ${isSelected ? 'text-[var(--ins-lamp)]' : 'invisible'}`} />
                  </DropdownMenuItem>
                );
              })}
              {Object.entries(groups).map(([dir, files]) => (
                <DropdownMenuSub key={dir}>
                  <DropdownMenuSubTrigger className="text-[11px] py-1.5">
                    <span className="truncate">{dir}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    {files.map((filename) => {
                      const isSelected = selectedPatterns.has(filename);
                      const label = filename.slice(dir.length + 1).replace(/\.md$/, '');
                      return (
                        <DropdownMenuItem
                          key={filename}
                          onClick={(e) => { e.preventDefault(); onTogglePattern(filename); }}
                          className={`flex items-center justify-between text-[11px] py-1.5 pl-3 ${isSelected ? 'ins-row-selected' : ''}`}
                        >
                          <span className="truncate pr-2">{label}</span>
                          <Check className={`h-3 w-3 flex-shrink-0 ${isSelected ? 'text-[var(--ins-lamp)]' : 'invisible'}`} />
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </>
          );
        })()}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={selectedCount === 0}
          onClick={(e) => { e.preventDefault(); selectedPatterns.forEach(p => onTogglePattern(p)); }}
          className="text-[11px] py-1.5 text-muted-foreground"
        >
          Clear all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
