export const ANTHROPIC_PRICING = {
  models: {
    'claude-opus-4-6': { input: 15.0, output: 75.0 },
    'claude-opus-4-5-20251101': { input: 15.0, output: 75.0 },
    'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
  },
  cacheReadDiscount: 0.25,
  cacheCreationPremium: 1.25,
};

export function calculateCost(usage, model) {
  const pricing = ANTHROPIC_PRICING.models[model] || ANTHROPIC_PRICING.models['claude-sonnet-4-5-20250929'];

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  const cacheReadCost = (usage.cacheReadInputTokens / 1_000_000) * pricing.input * ANTHROPIC_PRICING.cacheReadDiscount;
  const cacheCreateCost = (usage.cacheCreationInputTokens / 1_000_000) * pricing.input * ANTHROPIC_PRICING.cacheCreationPremium;

  return inputCost + outputCost + cacheReadCost + cacheCreateCost;
}

export function estimatePromptCost(tokenCount, model) {
  const pricing = ANTHROPIC_PRICING.models[model] || ANTHROPIC_PRICING.models['claude-sonnet-4-5-20250929'];
  const inputCost = (tokenCount / 1_000_000) * pricing.input;
  const outputEstimate = tokenCount * 1.2;
  const outputCost = (outputEstimate / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}
