// Anthropic first-party API rates, USD per million tokens.
//
// Matched by model id prefix in order, so the narrower ids (Fable 5.1,
// Opus 5.5, Opus 4.5-4.8) come before the family-wide fallbacks they share a
// prefix with. Session ids carry date or context suffixes
// (`claude-opus-4-5-20251101`, `claude-opus-5[1m]`) that the prefix ignores.
//
// Cache writes cost 1.25x input (5-minute TTL) and cache reads 0.1x input,
// except where a model sets its own `cacheRead` rate.
const MODEL_PRICES = [
  ['claude-fable-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-mythos-5-1', { input: 10, output: 50 }],
  ['claude-fable-5', { input: 10, output: 50 }],
  ['claude-mythos-5', { input: 10, output: 50 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25 }],
  ['claude-opus-4-8', { input: 5, output: 25 }],
  ['claude-opus-4-7', { input: 5, output: 25 }],
  ['claude-opus-4-6', { input: 5, output: 25 }],
  ['claude-opus-4-5', { input: 5, output: 25 }],
  ['claude-opus-4', { input: 15, output: 75 }], // 4.0 and 4.1
  ['claude-sonnet-5', { input: 2, output: 10 }],
  ['claude-sonnet-4', { input: 3, output: 15 }],
  ['claude-haiku-4', { input: 1, output: 5 }],
  ['claude-3-opus', { input: 15, output: 75 }],
  ['claude-3-7-sonnet', { input: 3, output: 15 }],
  ['claude-3-5-sonnet', { input: 3, output: 15 }],
  ['claude-3-5-haiku', { input: 0.8, output: 4 }],
  ['claude-3-haiku', { input: 0.25, output: 1.25 }],
];

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

// Claude Code's default model; used when a session doesn't name one.
export const DEFAULT_MODEL = 'claude-opus-5';

function withCacheRates({ input, output, cacheRead }) {
  return {
    input,
    output,
    cacheRead: cacheRead ?? input * CACHE_READ_MULTIPLIER,
    cacheWrite: input * CACHE_WRITE_MULTIPLIER,
  };
}

const DEFAULT_PRICING = withCacheRates(
  MODEL_PRICES.find(([prefix]) => prefix === DEFAULT_MODEL)[1]
);

/**
 * Per-million rates for a model: { input, output, cacheRead, cacheWrite }.
 * Unknown or missing models fall back to DEFAULT_MODEL's rates.
 */
export function getModelPricing(model) {
  if (!model) return DEFAULT_PRICING;
  const id = model.toLowerCase();
  // `includes` rather than `startsWith` so provider-prefixed ids
  // (`us.anthropic.claude-opus-5`) still resolve.
  const match = MODEL_PRICES.find(([prefix]) => id.includes(prefix));
  return match ? withCacheRates(match[1]) : DEFAULT_PRICING;
}

export function calculateCost(usage, model) {
  const pricing = getModelPricing(model);
  return (
    ((usage.inputTokens || 0) * pricing.input +
      (usage.outputTokens || 0) * pricing.output +
      (usage.cacheReadInputTokens || 0) * pricing.cacheRead +
      (usage.cacheCreationInputTokens || 0) * pricing.cacheWrite) /
    1_000_000
  );
}

/**
 * Input-side cost of sending `tokenCount` tokens. Output length depends on
 * the task, not the prompt, so it isn't guessed here.
 */
export function estimatePromptCost(tokenCount, model) {
  return (tokenCount / 1_000_000) * getModelPricing(model).input;
}
