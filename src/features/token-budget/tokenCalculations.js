import { calculateCost } from '../../config/pricing';

export function getStartOfDay() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function getStartOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(now.getFullYear(), now.getMonth(), diff).getTime();
}

export function formatTokenCount(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function formatCost(amount) {
  if (amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(2)}`;
}

export function usageFromTokenData(tokenUsage) {
  if (!tokenUsage) return null;
  return {
    inputTokens: tokenUsage.input_tokens || 0,
    outputTokens: tokenUsage.output_tokens || 0,
    cacheReadInputTokens: tokenUsage.cache_read_input_tokens || 0,
    cacheCreationInputTokens: tokenUsage.cache_creation_input_tokens || 0,
    total: (tokenUsage.billable_input_tokens || 0) + (tokenUsage.billable_output_tokens || 0),
  };
}

export function computeCostFromUsage(tokenUsage, model) {
  const usage = usageFromTokenData(tokenUsage);
  if (!usage) return 0;
  return calculateCost(usage, model);
}
