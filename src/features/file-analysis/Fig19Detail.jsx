import { useLayoutEffect, useRef, useState } from 'react';
import { DASH, Figure, INK, Node, Ruler, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { middleTruncate } from '../plans/Fig21PlanGit';

// FIG.19: what each detail level of a file costs, as measure lines on one
// token scale under the file's italic name: full text first, then each level
// the language produces, one row each (name, line, size). The chosen level is
// in lamp and its saving on the full text sits in italic on the caption; the
// default for the file's size is named in the figure's label (hover). Sizes are measured on the exact text the prompt sends
// (useFileSymbols' levelTokens). Compact stacks the bars tight over the
// ruler's ticks, the chosen one in lamp; sizes go to the tooltip.

const MIN_W = 180;
const C_MIN_W = 120; // compact has no text to keep at 1:1
const MAX_W = 360;
const ROW_H = 20;
const FIRST_ROW = 24;
const IN = 6; // content inset
const ITALIC_CH = 5.5; // Spectral italic at 12px, per character (x1.35 at 16px)

const LEVELS = [
  { key: 'symbols', label: 'symbols' },
  { key: 'signatures', label: 'signatures' },
  { key: 'skeleton', label: 'skeleton' },
];

// ≈ sizes: 840, 1.2k, 12k.
export function fmtTokens(n) {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(n / 1000)}k`;
}

/** "82% fewer tokens" against the full text, or null when it saves nothing. */
export function fmtSaving(ratio) {
  const pct = Math.round((1 - ratio) * 100);
  return pct > 0 ? `${pct}% fewer tokens` : null;
}

// A ruler step of 1/2/5 × 10^k giving labels at least `minPx` apart.
function niceStep(max, span, minPx) {
  if (!(max > 0)) return 1;
  const raw = (max * minPx) / span;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

/**
 * The rows, pure: one per level the language produces, with tokens and ratio
 * to the whole file. `chosen` and `defaultLevel` are view-mode keys.
 */
export function detailRows(levels, { chosen, defaultLevel } = {}) {
  if (!levels?.whole) return [];
  return LEVELS.filter((l) => levels[l.key] != null).map((l) => ({
    ...l,
    tokens: levels[l.key],
    ratio: levels[l.key] / levels.whole,
    chosen: l.key === chosen,
    isDefault: l.key === defaultLevel && l.key !== chosen,
  }));
}

/** The mono note after the italic name, shortened to the room it has. */
function noteText(lineCount, whole, room) {
  const tails = [`${lineCount} lines · ${fmtTokens(whole)} tok`, `${lineCount} L · ${fmtTokens(whole)}`, `${lineCount} L`, ''];
  return tails.find((s) => textWidth(s) <= room) ?? '';
}

const LABEL_W = 80; // the level names' column
const VALUE_W = 40; // the ≈ size column

/** The drawing at a given width, pure so it can be rendered headless. One
 *  row per level: name, measure line, size, as the site's Fig. 1A. */
export function fig19Layout({ name, lineCount, levels, chosen, defaultLevel, width }) {
  const lines = [
    // Python sends the whole file by default (no digest in the prompt).
    {
      key: 'whole',
      label: 'full text',
      tokens: levels.whole,
      ratio: 1,
      chosen: chosen === 'whole',
      isDefault: defaultLevel === 'whole' && chosen !== 'whole',
    },
    ...detailRows(levels, { chosen, defaultLevel }),
  ];
  const max = Math.max(...lines.map((r) => r.tokens));
  const x0 = IN + LABEL_W;
  const x1 = width - IN - VALUE_W;
  const xAt = (v) => x0 + (v / max) * (x1 - x0);
  const shown = middleTruncate(name, Math.max(6, Math.floor((width - 2 * IN) / ITALIC_CH / 1.4)));
  const nameW = shown.length * ITALIC_CH * 1.35;
  const note = noteText(lineCount, levels.whole, width - 2 * IN - nameW - 10);
  const height = FIRST_ROW + lines.length * ROW_H;

  const drawing = (
    <g>
      <text x={IN} y={14} style={{ fontFamily: 'var(--font-name)', fontStyle: 'italic', fontWeight: 300, fontSize: 16, fill: INK.fg }}>{shown}</text>
      {note && <T x={IN + nameW + 10} y={14}>{note}</T>}
      {lines.map((r, i) => {
        const y = FIRST_ROW + i * ROW_H + ROW_H / 2;
        const end = Math.max(x0 + 2, xAt(r.tokens));
        const ink = r.chosen ? INK.lamp : INK.fg;
        return (
          <g key={r.key}>
            <T x={IN} y={y + 4} color={r.chosen ? INK.lamp : INK.fg}>{r.label}</T>
            <path
              d={`M${x0} ${y - 4.5}V${y + 4.5}M${end} ${y - 4.5}V${y + 4.5}M${x0} ${y}H${end}`}
              style={{ fill: 'none', stroke: ink, strokeWidth: STROKE.hair }}
            />
            <T x={width - IN} y={y + 4} anchor="end" color={r.chosen ? INK.lamp : INK.fg}>{fmtTokens(r.tokens)}</T>
          </g>
        );
      })}
    </g>
  );
  const pick = lines.find((r) => r.chosen);

  return {
    height,
    drawing,
    saving: pick && pick.ratio < 1 ? fmtSaving(pick.ratio) : null,
    label: `${name}: ${lineCount} lines. ${lines
      .map((r) => `${r.label} about ${r.tokens} tokens${r.ratio < 1 ? `, ${fmtSaving(r.ratio) ?? 'the same'}` : ''}${r.chosen ? ' (chosen)' : ''}${r.isDefault ? ' (default)' : ''}`)
      .join('; ')}.`,
  };
}

const C_PITCH = 7;

/** Compact: the whole-file line and one bar per level, over the ruler's ticks. */
export function fig19Compact({ levels, chosen, defaultLevel, width }) {
  const rows = detailRows(levels, { chosen, defaultLevel });
  const max = Math.max(levels.whole, ...rows.map((r) => r.tokens));
  const x0 = 1;
  const x1 = width - 4;
  const xAt = (v) => x0 + (v / max) * (x1 - x0);
  const yAt = (i) => 4 + i * C_PITCH;
  const rulerY = yAt(rows.length + 1);
  const wholeX = xAt(levels.whole);
  const drawing = (
    <g>
      <line x1={x0} x2={wholeX} y1={yAt(0)} y2={yAt(0)} style={{ stroke: INK.faint, strokeWidth: STROKE.hair }} />
      <line x1={wholeX} x2={wholeX} y1={yAt(0) - 3} y2={rulerY} style={{ stroke: INK.edge, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }} />
      {rows.map((r, i) => {
        const y = yAt(i + 1);
        const end = Math.max(x0 + 1, xAt(r.tokens));
        return (
          <g key={r.key}>
            <line x1={x0} x2={end} y1={y} y2={y} style={{ stroke: r.chosen ? INK.lamp : INK.fg, strokeWidth: r.chosen ? STROKE.emphasis : STROKE.ink }} />
            <Node x={end} y={y} state="done" size={4} />
          </g>
        );
      })}
      <Ruler x0={x0} x1={x1} y={rulerY} max={max} step={niceStep(max, x1 - x0, 44)} numbers={false} />
    </g>
  );
  return { height: rulerY + 7, drawing };
}

/**
 * The file chip's detail-level figure, laid out at its container's width.
 * Renders nothing while the file is still being measured, or narrower than
 * MIN_W: the Detent under it says the same.
 */
export function Fig19Detail({ name, lineCount, levels, chosen, defaultLevel, paper }) {
  const compact = useFigureCompact();
  const rootRef = useRef(null);
  const [rootW, setRootW] = useState(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    setRootW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setRootW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measurable = levels?.whole > 0 && detailRows(levels).length > 0;
  const width = Math.max(compact ? C_MIN_W : MIN_W, Math.min(MAX_W, Math.floor(rootW ?? 240)));
  const fig = measurable ? fig19Layout({ name, lineCount, levels, chosen, defaultLevel, width }) : null;
  const small = measurable && compact ? fig19Compact({ levels, chosen, defaultLevel, width }) : null;

  return (
    <div ref={rootRef} className={fig && !small ? 'ins-fig-plate min-w-0 w-full' : 'min-w-0 w-full'}>
      {fig && (
        <Figure
          fig="detail"
          note={small ? undefined : fig.saving}
          viewBox={`0 0 ${width} ${fig.height}`}
          compactViewBox={small ? `0 0 ${width} ${small.height}` : undefined}
          minWidth={MIN_W}
          compactMinWidth={C_MIN_W}
          paper={paper}
          label={fig.label}
          fallback={null}
        >
          {small ? small.drawing : fig.drawing}
        </Figure>
      )}
    </div>
  );
}
