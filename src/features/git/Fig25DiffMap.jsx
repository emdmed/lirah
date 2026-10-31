import { plural } from '../../lib/plural';
import { Figure, Hatch, INK, Leader, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';

// FIG.25: the diff minimap as a line ruler. A vertical strip stands for the
// whole file, scaled in lines down its left side. Each change is a filled
// span with its line range and size on a leader; folded stretches of
// unchanged lines are hatched, with their length where there is room; the
// lamp bracket is what is on screen; review notes hang off their lines in
// boxes. Compact keeps the strip, the spans, the hatching, the bracket and a
// dot per note. Clicking the strip scrolls the diff there.
//
// Rows are the diff's aligned rows (DiffContent's line index), which is what
// the strip measures; labels print file line numbers.

export const MAP_W = 220; // full column width
export const MAP_COMPACT_W = 26;
const SX = 40; // strip left
const SW = 12; // strip width
const Y0 = 34; // strip top
const LX = 72; // label column
const GAP = 3; // between stacked labels

const NOTE_CHARS = Math.floor((MAP_W - LX - 14) / 7);

// Words into at most `max` lines of `n` characters, the last one clipped.
function wrap(text, n, max) {
  const lines = [];
  let cur = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= n || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, max);
  if (lines.length > max) out[max - 1] = `${out[max - 1]} ${lines.slice(max).join(' ')}`;
  return out.map((l, i) => (i === out.length - 1 ? clip(l, n) : l)).filter((l, i) => i < max);
}

const range = (a, b) => (a === b ? `L${a}` : `L${a}–${b}`);
const clip = (s, n) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s);

// A major step from 1·2·5 × 10^k giving three to six intervals.
function steps(total) {
  let major = 1;
  for (let k = 0; k < 9; k++) {
    const p = 10 ** k;
    const hit = [1, 2, 5].map((m) => m * p).find((s) => total / s <= 6);
    if (hit) { major = hit; break; }
  }
  return { major, minor: major / 5 };
}

// Stack labels by their anchor: each wants to sit centred on its anchor; push
// down past the one above, then pull back up from the bottom limit.
function stack(items, top, bottom) {
  let y = top;
  for (const it of items) {
    it.y = Math.max(it.ay - it.h / 2, y);
    y = it.y + it.h + GAP;
  }
  let limit = bottom;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.y + it.h > limit) it.y = limit - it.h;
    limit = it.y - GAP;
  }
  return items.length === 0 || items[0].y >= top - 0.5;
}

/**
 * `chunks`: [{ start, end, added, removed, from, to }] in rows, with file line
 * numbers from/to. `folds`: collapsed [{ start, end }]. `view`: { start, end }
 * rows on screen. `notes`: [{ id, row, from, to, note }]. `height` is the
 * strip's length in px. `marksOnly` draws the compact form without the
 * Figure wrapper (for a host too narrow for the full column).
 */
export function Fig25DiffMap({
  totalLines, chunks, folds = [], view, notes = [], height = 320, onJump, onRemoveNote, marksOnly = false,
}) {
  const compact = useFigureCompact() || marksOnly;
  if (!(totalLines > 0) || chunks.length === 0) return null;

  const L = height;
  const Y1 = Y0 + L;
  const y = (row) => Y0 + (Math.min(Math.max(row, 0), totalLines) / totalLines) * L;
  const added = chunks.reduce((s, c) => s + c.added, 0);
  const removed = chunks.reduce((s, c) => s + c.removed, 0);

  // Labels: every change and note, largest first when they can't all fit.
  const room = Math.floor((L + 24) / (14 + GAP));
  const noteItems = notes.map((n) => {
    const lines = wrap(n.note, NOTE_CHARS, 2);
    return { kind: 'note', n, lines, ay: y(n.row), h: 19 + 13 * lines.length };
  });
  const budget = Math.max(0, room - noteItems.reduce((s, it) => s + Math.ceil(it.h / (14 + GAP)), 0));
  const ranked = [...chunks].sort((a, b) => (b.added + b.removed) - (a.added + a.removed));
  const shown = new Set(ranked.slice(0, budget));
  const changeItems = chunks.filter((c) => shown.has(c)).map((c) => ({
    kind: 'change', c, ay: (y(c.start) + y(c.end + 1)) / 2, h: 14,
  }));
  const items = [...changeItems, ...noteItems].sort((a, b) => a.ay - b.ay);
  const fits = stack(items, Y0 - 6, Y1 + 8);
  const unlabelled = chunks.length - changeItems.length;

  // Fold lengths go in whatever label space is left.
  const foldItems = [];
  if (!compact && fits) {
    for (const f of folds) {
      const len = f.end - f.start + 1;
      const ay = (y(f.start) + y(f.end + 1)) / 2;
      const it = { ay, y: ay - 7, h: 14, len };
      const clear = [...items, ...foldItems].every((o) => it.y + it.h + GAP <= o.y || o.y + o.h + GAP <= it.y);
      if (clear && y(f.end + 1) - y(f.start) >= 6) foldItems.push(it);
    }
  }

  const { major, minor } = steps(totalLines);
  const minorPx = (minor / totalLines) * L;
  const step = minorPx >= 5 ? minor : major;
  const ticks = [];
  for (let i = 0; i * step <= totalLines; i++) {
    const v = i * step;
    ticks.push({ v, isMajor: v % major === 0 });
  }

  const vy0 = view ? y(view.start) : null;
  const vy1 = view ? Math.max(vy0 + 3, y(view.end)) : null;

  const jump = (e) => {
    if (!onJump) return;
    const svg = e.currentTarget.ownerSVGElement;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    onJump(Math.floor(((local.y - Y0) / L) * totalLines));
  };

  const label = [
    `${plural(chunks.length, 'change')} in ${plural(totalLines, 'line')}`,
    `+${added} −${removed}`,
    notes.length > 0 && plural(notes.length, 'review note'),
    view && `lines ${view.start + 1}–${Math.min(view.end, totalLines)} on screen`,
  ].filter(Boolean).join(', ');

  const marks = (
    <g>
      {/* The strip: the file top to bottom, folds hatched, changes filled. */}
      <rect x={SX} y={Y0} width={SW} height={L} style={{ fill: INK.paper, stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      {folds.map((f) => (
        <Hatch key={`f${f.start}`} x={SX} y={y(f.start)} width={SW} height={Math.max(1, y(f.end + 1) - y(f.start))} stroke="" />
      ))}
      {chunks.map((c) => {
        const top = y(c.start);
        const h = Math.max(3, y(c.end + 1) - top);
        return <rect key={`c${c.start}`} x={SX + 1.5} y={Math.min(top, Y1 - h)} width={SW - 3} height={h} style={{ fill: INK.fg }} />;
      })}
      {/* Notes: a dot on the strip's edge at their line. */}
      {notes.map((n) => (
        <circle key={`n${n.id}`} cx={SX + SW + 3} cy={y(n.row)} r={2} style={{ fill: INK.paper, stroke: INK.lamp, strokeWidth: STROKE.hair }} />
      ))}
      {/* What is on screen, bracketed in the lamp. */}
      {view && (
        <path
          d={`M${SX + SW + 3} ${vy0}H${SX - 4}V${vy1}H${SX + SW + 3}`}
          style={{ fill: 'none', stroke: INK.lamp, strokeWidth: STROKE.ink }}
        />
      )}
      {/* Hit area for click-to-scroll. */}
      <rect
        x={SX - 6}
        y={Y0}
        width={SW + 12}
        height={L}
        onClick={jump}
        style={{ fill: 'transparent', cursor: onJump ? 'pointer' : 'default' }}
      />
    </g>
  );

  const compactBox = `${SX - 8} ${Y0 - 4} ${MAP_COMPACT_W} ${L + 8}`;
  if (marksOnly) {
    return (
      <svg role="img" aria-label={label} viewBox={compactBox} width={MAP_COMPACT_W} height={L + 8} style={{ display: 'block', overflow: 'visible' }}>
        <title>{label}</title>
        {marks}
      </svg>
    );
  }

  const SUM_Y = Y1 + 16;
  const H = SUM_Y + 33;
  const sumLabel = `${plural(chunks.length, 'change')} in this file`;
  const sumValue = `+${added} −${removed}${unlabelled > 0 ? ` · ${unlabelled} not labelled` : ''}`;
  const viewLabelY = vy0 != null ? (vy0 + vy1) / 2 + 4 : null;
  // The view label wins over a scale number it would overprint.

  return (
    <Figure
      fig="diff-map"
      title={`DIFF · ${totalLines} LINES`}
      viewBox={`0 0 ${MAP_W} ${H}`}
      compactViewBox={compactBox}
      label={label}
      paper="var(--ins-panel)"
    >
      {!compact && (
        <g>
          {/* Line scale down the left of the strip. */}
          <line x1={SX - 6} x2={SX - 6} y1={Y0} y2={Y1} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
          {ticks.map((t) => (
            <g key={t.v}>
              <line
                x1={SX - 6}
                x2={SX - 6 - (t.isMajor ? 6 : 3)}
                y1={y(t.v)}
                y2={y(t.v)}
                style={{ stroke: t.isMajor ? INK.faint : INK.edgeStrong, strokeWidth: STROKE.hair }}
              />
              {t.isMajor && !(viewLabelY != null && Math.abs(y(t.v) + 4 - viewLabelY) < 12) && (
                <T x={SX - 15} y={y(t.v) + 4} anchor="end" color={INK.faint}>{t.v}</T>
              )}
            </g>
          ))}
          {view && (
            <T x={SX - 15} y={viewLabelY} anchor="end" color={INK.lamp}>view</T>
          )}

          {/* Fold lengths. */}
          {foldItems.map((f) => (
            <T key={`fl${f.ay}`} x={SX + SW + 8} y={f.y + 11} color={INK.faint}>{`${f.len} unchanged`}</T>
          ))}

          {/* Changes and notes on leaders. */}
          {items.map((it) => {
            const iy = it.y + (it.kind === 'note' ? 9 : it.h / 2);
            const from = it.kind === 'note' ? [SX + SW + 3, it.ay] : [SX + SW + 1, it.ay];
            const pts = Math.abs(iy - it.ay) < 1
              ? [from, [LX - 5, it.ay]]
              : [from, [SX + SW + 8, it.ay], [LX - 12, iy], [LX - 5, iy]];
            if (it.kind === 'change') {
              const { c } = it;
              const r = range(c.from, c.to);
              const ax = LX + textWidth(r) + 7;
              const at = c.added > 0 ? `+${c.added}` : '';
              return (
                <g key={`l${c.start}`}>
                  <Leader points={pts} dot={false} />
                  <T x={LX} y={it.y + 11} color={INK.fg}>{r}</T>
                  {at && <T x={ax} y={it.y + 11} color={INK.ok}>{at}</T>}
                  {c.removed > 0 && <T x={ax + (at ? textWidth(at) + 6 : 0)} y={it.y + 11} color={INK.fault}>{`−${c.removed}`}</T>}
                </g>
              );
            }
            const { n } = it;
            const bw = MAP_W - LX;
            const chars = Math.floor((bw - 14) / 7);
            return (
              <g key={`b${n.id}`}>
                <Leader points={pts} dot={false} color={INK.lamp} />
                <rect x={LX} y={it.y} width={bw} height={it.h} style={{ fill: INK.paper, stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
                <T x={LX + 7} y={it.y + 13}>{clip(`note · ${range(n.from, n.to)}`, chars - 2)}</T>
                {it.lines.map((line, i) => (
                  <T key={i} x={LX + 7} y={it.y + 26 + 13 * i} color={INK.fg}>{line}</T>
                ))}
                {onRemoveNote && (
                  <g onClick={() => onRemoveNote(n.id)} style={{ cursor: 'pointer' }}>
                    <title>Remove note</title>
                    <rect x={MAP_W - 16} y={it.y + 1} width={15} height={15} style={{ fill: 'transparent' }} />
                    <T x={MAP_W - 8.5} y={it.y + 13} anchor="middle" color={INK.faint}>×</T>
                  </g>
                )}
              </g>
            );
          })}

          {/* The file's total. */}
          <rect x={0} y={SUM_Y} width={MAP_W} height={32} style={{ fill: INK.paper, stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
          <T x={7} y={SUM_Y + 13}>{sumLabel}</T>
          <T x={7} y={SUM_Y + 26} color={INK.fg}>{sumValue}</T>
        </g>
      )}
      {marks}
    </Figure>
  );
}
