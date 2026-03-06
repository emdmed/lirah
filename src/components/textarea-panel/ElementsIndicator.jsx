import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Button } from "../ui/button";
import { X } from "lucide-react";
import { ElementsTooltipContent } from "./ElementsTooltipContent";

export function ElementsIndicator({ selectedElements, currentPath, elementCount, onClearElements }) {
  if (elementCount <= 0) return null;

  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-secondary border border-secondary rounded w-fit text-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-default">
            <span className="text-primary font-medium">
              {elementCount} element{elementCount !== 1 ? 's' : ''} selected
            </span>
            <span className="text-muted-foreground">
              from {selectedElements.size} file{selectedElements.size !== 1 ? 's' : ''}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md text-left p-3">
          <ElementsTooltipContent selectedElements={selectedElements} currentPath={currentPath} />
        </TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="xs"
        onClick={onClearElements}
        className="ml-auto p-0.5 h-auto hover:bg-white/10"
        aria-label="Clear selected elements"
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}
