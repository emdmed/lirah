import React, { useMemo } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { useTokenBudget } from '../contexts/TokenBudgetContext';
import { estimatePromptCost } from '../config/pricing';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

export function TokenCostEstimate({ textareaContent, selectedFiles, projectPath, orchestrationTokenEstimate }) {
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

    // Orchestration context - only add when explicitly enabled (> 0)
    if (orchestrationTokenEstimate != null && orchestrationTokenEstimate > 0) {
      tokens += orchestrationTokenEstimate;
    }

    // System overhead
    tokens += 500;

    return tokens;
  }, [textareaContent, selectedFiles, orchestrationTokenEstimate]);

  const cost = useMemo(() => estimatePromptCost(estimate, DEFAULT_MODEL), [estimate]);

  // Only show estimate when there's actual user content (not just system overhead)
  // Note: orchestrationTokenEstimate must be > 0 and not null to count as user content
  const hasUserContent = (textareaContent?.length > 0) || 
                         (selectedFiles?.size > 0) || 
                         (orchestrationTokenEstimate != null && orchestrationTokenEstimate > 0);
  
  // Don't show estimate if there's no user content (avoid showing just the 500 base system prompt)
  if (!hasUserContent) return null;

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
          {orchestrationTokenEstimate != null && orchestrationTokenEstimate > 0 && (
            <div>Orchestration: ~{orchestrationTokenEstimate.toLocaleString()}</div>
          )}
          <div>Base system prompt: ~500</div>
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
