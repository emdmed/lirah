export const DEFAULT_CONTEXT_WINDOW = 200_000;
export const EXTENDED_CONTEXT_WINDOW = 1_000_000;
// Past this many context tokens a session is heavy regardless of window size.
export const HEAVY_CONTEXT_TOKENS = 300_000;

// Keyed by model id prefix; first matching prefix wins, so the 200K
// generations (Claude 3.x, Opus/Sonnet 4.0-4.5, Haiku) come before the
// family-wide 1M defaults (Opus/Sonnet 4.6+, the 5 family, Fable, Mythos).
export const CONTEXT_WINDOWS = {
  'claude-3': 200_000,
  'claude-haiku': 200_000,
  'claude-opus-4-0': 200_000,
  'claude-opus-4-1': 200_000,
  'claude-opus-4-2': 200_000, // claude-opus-4-20250514
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-0': 200_000,
  'claude-sonnet-4-2': 200_000, // claude-sonnet-4-20250514
  'claude-sonnet-4-5': 200_000,
  'claude-opus': 1_000_000,
  'claude-sonnet': 1_000_000,
  'claude-fable': 1_000_000,
  'claude-mythos': 1_000_000,
};

const EXTENDED_CONTEXT_PATTERN = /(\[1m\]|-1m)$/i;

export function getContextWindow(model) {
  if (!model) return DEFAULT_CONTEXT_WINDOW;
  if (EXTENDED_CONTEXT_PATTERN.test(model)) return EXTENDED_CONTEXT_WINDOW;

  const prefix = Object.keys(CONTEXT_WINDOWS).find((p) => model.startsWith(p));
  return prefix ? CONTEXT_WINDOWS[prefix] : DEFAULT_CONTEXT_WINDOW;
}

export function getContextFill(tokenUsage) {
  const used = tokenUsage?.context_tokens || 0;
  if (!used) return null;

  // Usage past the known window means the session runs a larger one than the
  // table says (an unlisted model or a 1M opt-in without the suffix).
  const known = getContextWindow(tokenUsage.last_model || tokenUsage.model);
  const max = used > known ? Math.max(known, EXTENDED_CONTEXT_WINDOW) : known;
  return { used, max, ratio: used / max };
}
