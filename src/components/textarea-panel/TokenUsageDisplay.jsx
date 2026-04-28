import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Coins } from "lucide-react";
import { TokenCostEstimate } from "../../features/token-budget";
import { formatTokenCount } from "../../features/token-budget/tokenCalculations";

export function TokenUsageDisplay({ tokenUsage, textareaContent, selectedFiles, projectPath }) {
  const hasTokens = tokenUsage && (tokenUsage.billable_input_tokens > 0 || tokenUsage.billable_output_tokens > 0);
  const billableTotal = hasTokens ? tokenUsage.billable_input_tokens + tokenUsage.billable_output_tokens : 0;

  return (
    <div className="flex items-center gap-3">
      <TokenCostEstimate
        textareaContent={textareaContent}
        selectedFiles={selectedFiles}
        projectPath={projectPath}
      />
      {hasTokens && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors cursor-default">
              <Coins className="w-3 h-3" />
              <span>{formatTokenCount(billableTotal)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>
            <div className="text-xs space-y-1 font-mono">
              <div className="flex justify-between gap-4 font-semibold border-b border-border pb-1 mb-1">
                <span>Billable</span>
                <span>{billableTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Input</span>
                <span>{tokenUsage.billable_input_tokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Output</span>
                <span>{tokenUsage.billable_output_tokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-4 pt-1 border-t border-border mt-1 text-muted-foreground">
                <span>Cache read (free)</span>
                <span>{tokenUsage.cache_read_input_tokens.toLocaleString()}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
