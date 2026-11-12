import { CalRecipe, Calibrated } from '@/components/instrument/calibrated';
import { formatTokenCount } from './tokenCalculations';
import { groupLabel, sharePct } from './contextGroups';
import { basename } from '../../utils/pathUtils';

// FIG.23: what the used context is made of, as Lirah's measuredToned recipe in the atlas hand (measuredAtlas)
// (components/instrument/calibrated/recipes/measuredToned.js). The window's
// ruler with the used span, a DETAIL inset magnifying it, and each source as
// a part of the inset bar (largest first, darkest ink first), boxed on
// leaders; what the transcript can't account for (`unlogged`) is hatched.
// Sources that don't fit a box fold into "+N more". A line under the boxes
// names the largest single piece and what the hatch means. Fills in when
// shown. Compact, or without the window size, it shows `fallback`.

const W = 400;
const MIN_W = 360;
const BOX_X = 18; // the furthest left the recipe starts its row of boxes
const FACTORS = [2, 5, 10, 20, 50];

// Short names, so three boxes fit across 288px.
const SHORT = {
  results: 'tool results',
  calls: 'tool calls',
  thinking: 'thinking',
  reminders: 'reminders',
  tools: 'tool defs',
  system: 'system',
  replies: 'replies',
  prompts: 'prompts',
  images: 'images',
  unlogged: 'sys + tools',
  other: 'other',
};
// Ink, darkest-first after the lead: the bar reads by order, not hue.
const INKS = ['fg', 'mu', 'fa', 'ed', 'e1'];

const kfmt = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}k` : String(Math.round(v)));
const baseName = (s) => basename(String(s || ''), s);

// The smallest round magnification whose inset still holds `used`.
function zoom(used, max) {
  const fits = FACTORS.filter((k) => used * k <= max);
  const k = fits.length ? fits[fits.length - 1] : max / used;
  return { zoomMax: max / k, factor: Number.isInteger(k) ? String(k) : k.toFixed(1) };
}

/**
 * `breakdown` is get_context_breakdown's result (groups, items,
 * total_tokens); `windowMax` the model's context window. Falls back when
 * there is nothing measured.
 */
export function Fig23Sources({ breakdown, windowMax, fallback, className }) {
  const total = breakdown?.total_tokens || 0;
  const groups = (breakdown?.groups || []).filter((g) => g.tokens > 0).sort((a, b) => b.tokens - a.tokens);
  if (!total || !groups.length || !(windowMax > 0)) return fallback;

  const sum = groups.reduce((n, g) => n + g.tokens, 0);
  const max = Math.max(windowMax, sum);
  const val = (v) => `≈ ${kfmt(v)}`;
  // What the transcript can't account for (`unlogged`) is hatched, as before.
  const part = (g, i) => ({ label: SHORT[g.group] || g.group, value: g.tokens, ink: INKS[Math.min(i, INKS.length - 1)], hatch: g.group === 'unlogged' });

  // As many named sources as fit the row of boxes; the rest fold into one.
  let parts = groups.map(part);
  for (let n = groups.length; n >= 1; n--) {
    const named = groups.slice(0, n === groups.length ? n : n - 1).map(part);
    const rest = groups.slice(named.length);
    const all = rest.length
      ? [...named, { label: `+${rest.length} more`, value: rest.reduce((m, g) => m + g.tokens, 0), ink: INKS[Math.min(named.length, INKS.length - 1)] }]
      : named;
    const row = all.reduce((x, p) => x + Calibrated.K.boxWidth(p.label, val(p.value)) + 10, BOX_X);
    parts = all;
    if (row - 10 <= W) break;
  }

  const piece = breakdown.items?.[0];
  const pieceName = piece && (piece.label ? `${piece.kind.toLowerCase()} ${baseName(piece.label)}` : piece.kind.toLowerCase());
  // One line under the boxes: the largest piece, and what the hatch means.
  // Longest form that fits; the full piece name stays in the tooltip.
  const hatched = groups.some((g) => g.group === 'unlogged');
  const hatchNote = hatched ? 'hatched: not in transcript' : null;
  const note = [
    [piece && `largest · ${pieceName} · ${kfmt(piece.tokens)}`, hatchNote],
    [piece && `largest piece ${kfmt(piece.tokens)}`, hatchNote],
    [hatchNote],
  ].map((xs) => xs.filter(Boolean).join(' · ')).find((t) => t && Calibrated.textWidth(t) <= W - 8);

  const label = [
    `Context ${kfmt(total)} by source: ${groups.map((g) => `${groupLabel(g.group).toLowerCase()} ${sharePct(g.tokens, total)} (${kfmt(g.tokens)})`).join(', ')}`,
    hatched && 'system prompt and tools are not in the transcript',
    piece && `largest piece ${pieceName}, ${kfmt(piece.tokens)}`,
  ].filter(Boolean).join('; ');

  const data = {
    w: W,
    title: `context · ${kfmt(total)} by source`,
    max,
    ...zoom(sum, max),
    fmt: formatTokenCount,
    parts,
    note: note ? [note, 'fa'] : undefined,
    label,
  };

  return (
    <div className={className} title={label}>
      <CalRecipe recipe="measuredAtlas" data={data} minWidth={MIN_W} paper="var(--ins-raised)" fallback={fallback} />
    </div>
  );
}
