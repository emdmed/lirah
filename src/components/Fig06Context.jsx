import { CalRecipe } from '@/components/instrument/calibrated';
import { getContextFill, HEAVY_CONTEXT_TOKENS } from '@/config/models';
import { formatTokenCount } from '@/features/token-budget/tokenCalculations';

// FIG.06: what fills the context window on the last turn, as Lirah's
// measuredToned recipe (the calibrated measured recipe plus tones, in
// components/instrument/calibrated/recipes/measuredToned.js). The window's
// ruler with the used span and an amber tick where the context gets heavy, a
// DETAIL inset magnifying its start, the parts of the used span (cached read
// in lamp, new cache, uncached) boxed on leaders, and the cache hit rate on
// the plate. The readout and used span turn amber past 80% or once heavy, red
// past 95%. It fills in when first shown; when the next turn changes the
// parts, the bars glide to the new values and the changed boxes blink.
// Compact shows `fallback`.

const W = 400;
const MIN_W = 360;
const FACTORS = [2, 5, 10, 20, 50];
const WARN = 'var(--ins-warn)';

/**
 * The inset's magnification: it shows the first 1/k of the window. The
 * smallest k that makes the used span at least 60% of the inset while still
 * fitting; failing that, the largest that fits. Past a fifth of the window no
 * round factor fits, so the inset spans exactly the used tokens.
 */
export function insetFactor(used, max) {
  if (!(used > 0) || !(max > 0)) return 1;
  const fits = FACTORS.filter((k) => used * k <= max);
  if (!fits.length) return max / used;
  return fits.find((k) => (used * k) / max >= 0.6) ?? fits[fits.length - 1];
}

const fmtFactor = (k) => (Number.isInteger(k) ? String(k) : k.toFixed(1));
const share = (v, total) => {
  const p = Math.round((v / total) * 100);
  return p === 0 && v > 0 ? '<1%' : `${p}%`;
};

/** True when the session reports last-turn parts (sessions read before they existed don't). */
export function hasContextParts(tokenUsage) {
  return !!(tokenUsage?.last_input_tokens || tokenUsage?.last_cache_read_tokens || tokenUsage?.last_cache_creation_tokens);
}

export function Fig06Context({ tokenUsage, fallback, className }) {
  const ctx = getContextFill(tokenUsage);
  if (!ctx || !hasContextParts(tokenUsage)) return fallback;

  const { used, max } = ctx;
  const read = tokenUsage.last_cache_read_tokens || 0;
  const creation = tokenUsage.last_cache_creation_tokens || 0;
  const input = tokenUsage.last_input_tokens || 0;
  const parts = [
    { label: 'cached read', value: read, ink: 'lv' },
    { label: 'new cache', value: creation, ink: 'mu' },
    { label: 'uncached', value: input },
  ].filter((p) => p.value > 0);
  const partsTotal = read + creation + input;
  const hit = Math.round((read / partsTotal) * 100);
  const pct = Math.round((used / max) * 100);
  // Red past 95%, amber past 80% or once the context is heavy, as before.
  const heavy = used > HEAVY_CONTEXT_TOKENS;
  const tone = pct >= 95 ? 'ft' : pct >= 80 || heavy ? WARN : 'fg';

  // The inset shows the first 1/k of the window, and must hold every part.
  const k = insetFactor(Math.max(used, partsTotal), max);
  const id = tokenUsage.session_id;
  const label = `Context ${formatTokenCount(used)} of ${formatTokenCount(max)} (${pct}%)${id ? ` in session ${id}` : ''}: ${parts
    .map((p) => `${p.label} ${formatTokenCount(p.value)} (${share(p.value, partsTotal)})`)
    .join(', ')}; cache hit ${hit}%.`;

  const data = {
    w: W,
    title: 'context · ',
    readout: [`${formatTokenCount(used)} / ${formatTokenCount(max)} · ${pct}%`, tone],
    usedInk: tone,
    marks: HEAVY_CONTEXT_TOKENS < max ? [{ v: HEAVY_CONTEXT_TOKENS, ink: WARN }] : [],
    max,
    zoomMax: max / k,
    factor: fmtFactor(k),
    fmt: formatTokenCount,
    parts,
    plate: ['CACHE HIT', `${hit}%`],
    label,
  };

  return (
    <div className={className} title={label}>
      <CalRecipe recipe="measuredToned" data={data} transition={glide} minWidth={MIN_W} paper="var(--ins-raised)" fallback={fallback} />
    </div>
  );
}

// Same window and parts, new values: glide from the old ones.
function glide(a, b) {
  const same = a.max === b.max && a.zoomMax === b.zoomMax
    && a.parts.length === b.parts.length && a.parts.every((p, i) => p.label === b.parts[i].label);
  if (!same || a.parts.every((p, i) => p.value === b.parts[i].value)) return null;
  return { ...b, prev: a.parts.map((p) => p.value) };
}
