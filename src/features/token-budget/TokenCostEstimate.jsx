import React, { useMemo } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useTokenBudget } from './TokenBudgetContext';
import { estimatePromptCost, DEFAULT_MODEL } from '../../config/pricing';
import { CHARS_PER_TOKEN, toTokens } from './estimateTokens';
import { Fig24PromptCost } from './Fig24PromptCost';

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
    count: s.count,
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
      <TooltipContent side="top" className="w-[396px] max-w-none py-2 text-xs font-mono">
        {/* Figures: FIG.24 draws the payload as a dimension chain; the
            per-section lines are its fallback. */}
        <Fig24PromptCost
          parts={figParts(textChars, breakdown)}
          total={estimate}
          cost={cost}
          budget={budget?.dailyLimit ? { limit: budget.dailyLimit, used: currentUsage.total } : null}
          fallback={(
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
          )}
        />
      </TooltipContent>
    </Tooltip>
  );
}

// FIG.24's parts in payload order: the typed prompt, each section (the
// count or template title as detail), the agent's system prompt last.
function figParts(textChars, breakdown) {
  const parts = [];
  if (textChars > 0) parts.push({ id: 'typed', name: 'your prompt', tokens: toTokens(textChars) });
  for (const s of breakdown) {
    const [head, ...rest] = s.label.split(' · ');
    const title = rest.join(' · ');
    const detail = title ? (title.length > 10 ? `${title.slice(0, 9)}…` : title) : s.count > 0 ? String(s.count) : undefined;
    parts.push({ id: s.id, name: head.toLowerCase(), detail: detail?.toLowerCase(), tokens: s.tokens });
  }
  parts.push({ id: 'system', name: 'agent system', tokens: SYSTEM_OVERHEAD });
  return parts;
}
