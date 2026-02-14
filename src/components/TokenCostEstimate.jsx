import React, { useMemo } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { useTokenBudget } from '../contexts/TokenBudgetContext';
import { estimatePromptCost } from '../config/pricing';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

export function TokenCostEstimate({ textareaContent, selectedFiles, projectPath }) {
  const { checkBudgetStatus, getBudget, currentUsage } = useTokenBudget();

  const estimate = useMemo(() => {
    let tokens = 0;

    // Textarea content: ~1 token per 4 chars
    if (textareaContent) {
      tokens += Math.ceil(textareaContent.length / 4);
    }

    // Selected files estimate
    if (selectedFiles && selectedFiles.size > 0) {
      // Rough estimates based on file analysis tiers
      tokens += selectedFiles.size * 200; // average per file
    }

    // System overhead
    tokens += 500;

    return tokens;
  }, [textareaContent, selectedFiles]);

  const cost = useMemo(() => estimatePromptCost(estimate, DEFAULT_MODEL), [estimate]);

  if (estimate <= 500) return null; // Only system overhead, nothing to show

  const budget = getBudget(projectPath);
  const { status } = checkBudgetStatus(projectPath);
  const wouldExceed = budget?.dailyLimit && (currentUsage.total + estimate) > budget.dailyLimit;

  const colorStyle = wouldExceed ? { color: '#E82424' }
    : status === 'warning' ? { color: '#FF9E3B' }
    : { color: 'var(--muted-foreground)' };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-xs font-mono cursor-default" style={colorStyle}>
          Est: ~{estimate.toLocaleString()} tokens (${cost.toFixed(2)})
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs font-mono">
        <div className="space-y-1">
          <div>Prompt text: ~{textareaContent ? Math.ceil(textareaContent.length / 4) : 0}</div>
          <div>Files: ~{selectedFiles ? selectedFiles.size * 200 : 0}</div>
          <div>System: ~500</div>
          {budget?.dailyLimit && (
            <div className="pt-1 border-t border-border mt-1">
              Remaining: {Math.max(0, budget.dailyLimit - currentUsage.total).toLocaleString()} tokens
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
