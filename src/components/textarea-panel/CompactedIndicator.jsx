import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Button } from "../ui/button";
import { X, Map } from "lucide-react";

export function CompactedIndicator({ compactedProject, onClearCompactedProject, onOpenSections, onOpenFlowchart }) {
  if (!compactedProject) return null;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-secondary/30 border border-sketch rounded-none w-fit text-xs font-mono">
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={onOpenSections}
          >
            <span className="text-muted-foreground/70 uppercase text-[10px] tracking-wider border-r border-border/30 pr-2">Compacted</span>
            <div className="flex items-center gap-1.5">
              <span className="text-primary font-medium">{compactedProject.fileCount}</span>
              <span className="text-muted-foreground">files</span>
            </div>
            <div className="w-px h-3 bg-border/50" />
            <div className="flex items-center gap-1.5">
              <span className="text-primary font-medium">{compactedProject.formattedTokens}</span>
              <span className="text-muted-foreground">tokens</span>
            </div>
            <div className="w-px h-3 bg-border/50" />
            <div className="flex items-center gap-1 text-green-500/80">
              <span className="font-medium">-{compactedProject.compressionPercent}%</span>
              <span className="text-[10px]">saved</span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md text-left p-3">
          <div className="space-y-2">
            <div className="font-medium">Click to toggle sections on/off</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{compactedProject.formattedOriginalTokens}</span>
              <span>→</span>
              <span className="text-primary">{compactedProject.formattedTokens}</span>
            </div>
            {compactedProject.fileName && (
              <div className="text-muted-foreground text-xs truncate">
                Saved to: {compactedProject.fileName}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
      <div className="flex items-center gap-0.5 border-l border-border/30 pl-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              onClick={onOpenFlowchart}
              className="p-0.5 h-auto text-muted-foreground hover:text-primary hover:bg-white/10"
              aria-label="View flowchart"
            >
              <Map className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Flowchart</TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="xs"
          onClick={onClearCompactedProject}
          className="p-0.5 h-auto text-muted-foreground hover:text-destructive hover:bg-white/10"
          aria-label="Clear compacted project"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
