import React, { useMemo } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useTokenBudget } from './TokenBudgetContext';
import { estimatePromptCost, DEFAULT_MODEL } from '../../config/pricing';
import { CHARS_PER_TOKEN, toTokens } from './estimateTokens';

// What the agent's own system prompt adds to any turn.
const SYSTEM_OVERHEAD = 500;
// buildPrompt joins sections with a blank line.
const SECTION_JOIN = 2;

/**
 * Token estimate for the next send, measured on the payload itself.
 *
 * `promptBase` is the buildPrompt result without the typed text (the tab
 * builds it once per context change, for the preview and the sender). The
 * typed text is one more section, so the full length is
 * `base.text.length + join + text.length`: O(1) per keystroke, no string is
 * built. Files go out as paths plus digests, so their size here is what is
 * really sent; the contents the agent reads afterwards are not counted.
 */
export function TokenCostEstimate({ promptBase, textareaContent, projectPath }) {
  const { checkBudgetStatus, getBudget, currentUsage } = useTokenBudget();

  // Per-section breakdown for the tooltip: depends on the context only.
  const breakdown = useMemo(() => (promptBase?.sections || []).map((s) => ({
    id: s.id,
    label: s.label,
    tokens: toTokens(s.body.length),
  })), [promptBase]);

  const baseChars = promptBase?.text?.length ?? 0;
  const textChars = textareaContent?.trim() ? textareaContent.length : 0;
  const payloadChars = baseChars + textChars + (baseChars > 0 && textChars > 0 ? SECTION_JOIN : 0);
  const payloadTokens = toTokens(payloadChars);
  const estimate = payloadTokens + SYSTEM_OVERHEAD;

  const cost = useMemo(() => estimatePromptCost(estimate, DEFAULT_MODEL), [estimate]);

  // Nothing to send: don't show the bare system overhead as if it were a prompt.
  if (payloadChars === 0) return null;

  const budget = getBudget(projectPath);
  const { status } = checkBudgetStatus(projectPath);
  const wouldExceed = budget?.dailyLimit && (currentUsage.total + estimate) > budget.dailyLimit;

  // Status colours come from the theme's own tokens.
  const valueStyle = wouldExceed
    ? { color: 'var(--color-status-critical)', textShadow: 'none' }
    : status === 'warning'
      ? { color: 'var(--color-status-warning)', textShadow: 'none' }
      : undefined;

  // Sits in the pane's bottom border (PaneInfo), a 12px strip: the readout
  // keeps the strip's size so it stays on the line instead of spilling over it.
  // Delayed: the readout sits in the border right under the pane's controls,
  // and an instant breakdown would open over them on the way to a click.
  return (
    <Tooltip delayDuration={600}>
      <TooltipTrigger asChild>
        <span className="inline-flex items-baseline gap-1.5 font-mono cursor-default">
          <span className="tube tube-change" style={valueStyle}>
            ~{estimate.toLocaleString()}
          </span>
          <span>tok</span>
          <span style={valueStyle}>
            {cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs font-mono">
        <div className="space-y-1">
          {textChars > 0 && <div>Your prompt: ~{toTokens(textChars).toLocaleString()}</div>}
          {breakdown.map((s) => (
            <div key={s.id}>{s.label.toLowerCase()}: ~{s.tokens.toLocaleString()}</div>
          ))}
          <div>Agent system prompt: ~{SYSTEM_OVERHEAD}</div>
          <div className="text-muted-foreground font-sans">
            Measured on the payload ({payloadChars.toLocaleString()} chars ÷ {CHARS_PER_TOKEN}). File contents the agent reads are not included.
          </div>
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
