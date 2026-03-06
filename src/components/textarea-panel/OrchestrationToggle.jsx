import { Checkbox } from "../ui/checkbox";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

export function OrchestrationToggle({ appendOrchestration, onToggleOrchestration, orchestrationTokenEstimate, disabled, isWide }) {
  if (!onToggleOrchestration) return null;

  if (isWide) {
    return (
      <div className=" border border-sketch p-2">
        <h4 className="text-xs font-medium text-primary mb-1 flex items-center gap-1.5">
          <Checkbox
            id="orchestration-wide"
            checked={appendOrchestration}
            onCheckedChange={onToggleOrchestration}
            disabled={disabled}
            className="border-primary/50"
          />
          <label htmlFor="orchestration-wide" className="cursor-pointer select-none">
            Orchestration
          </label>
        </h4>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Double-tap Ctrl to toggle</span>
          <span className="text-[10px] text-muted-foreground/60">
            {appendOrchestration && orchestrationTokenEstimate != null
              ? `+${orchestrationTokenEstimate.toLocaleString()} tokens`
              : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-secondary/20 rounded px-2 py-1">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <Checkbox
                id="orchestration"
                checked={appendOrchestration}
                onCheckedChange={onToggleOrchestration}
                disabled={disabled}
              />
              <label htmlFor="orchestration" className="text-muted-foreground cursor-pointer select-none text-xs">
                orchestration
                {appendOrchestration && orchestrationTokenEstimate != null && (
                  <span className="text-muted-foreground/60 ml-1">(~{orchestrationTokenEstimate.toLocaleString()})</span>
                )}
              </label>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span className="text-xs">
              {appendOrchestration && orchestrationTokenEstimate != null
                ? `Adds ~${orchestrationTokenEstimate.toLocaleString()} tokens to prompt`
                : 'Enable to append orchestration context'}
            </span>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground/40 text-[10px] cursor-help">Ctrl+Ctrl</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span className="text-xs">Double-tap Ctrl to toggle</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
