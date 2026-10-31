import { useLayoutEffect, useRef, useState } from 'react';
import { Dim, Figure, INK, Node, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { formatDuration } from '../../lib/formatDuration';
import { CHUNK_STATUS } from './planModel';

// FIG.16: a plan's chunks as nodes on a line. Done chunks are filled, the one
// in flight is the lamp star, the rest are outlined (skipped and rolled-back
// ones struck through). A dimension over the done span gives their summed
// working time; once two are done, a lamp dimension over the rest estimates
// what's left at the mean pace. Compact is the node line alone.

const MIN_W = 180;
const C_MIN_W = 120; // compact has no text to keep at 1:1
const MAX_W = 480;
const PAD = 9; // room for the live star's points at the first node
const DIM_Y = 37;
const LINE_Y = 56;
const H = 76;
const C_H = 16; // compact: the node line, centred, room for the live star

const isLive = (c) => c.status === CHUNK_STATUS.IN_PROGRESS || c.awaitingFix;
const isStruck = (c) => c.status === CHUNK_STATUS.SKIPPED || c.status === CHUNK_STATUS.ROLLED_BACK;

/**
 * The ruler's numbers, pure: each chunk's node state, the done span's summed
 * time, and the estimate for the rest (null until two timed chunks are done).
 */
export function chunkRuler(plan) {
  const chunks = plan.chunks;
  const nodes = chunks.map((c) => ({
    n: c.n,
    state: isLive(c) ? 'live' : c.status === CHUNK_STATUS.IMPLEMENTED ? 'done' : 'todo',
    struck: isStruck(c),
  }));
  const doneChunks = chunks.filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED);
  const total = chunks.filter((c) => c.status !== CHUNK_STATUS.SKIPPED).length;
  const timed = doneChunks
    .filter((c) => c.startedAt && c.doneAt && c.doneAt >= c.startedAt)
    .map((c) => c.doneAt - c.startedAt);
  const spent = timed.reduce((a, b) => a + b, 0);
  const remaining = total - doneChunks.length;
  const estimate = timed.length >= 2 && remaining > 0 ? (spent / timed.length) * remaining : null;
  let lastDone = -1;
  chunks.forEach((c, i) => { if (c.status === CHUNK_STATUS.IMPLEMENTED) lastDone = i; });
  return {
    nodes,
    done: doneChunks.length,
    total,
    spent: timed.length ? spent : null,
    estimate,
    lastDone,
    live: nodes.findIndex((nd) => nd.state === 'live'),
  };
}

// Which chunk numbers get an index label: 1, then every 5th (10th, 20th… when
// crowded), then the last, dropping any that would touch a neighbour.
function indexLabels(count, spacing) {
  const room = textWidth(String(count)) + 6;
  let step = 5;
  while (step * spacing < room) step *= 2;
  const want = [1];
  for (let k = step; k < count; k += step) want.push(k);
  if (count > 1) want.push(count);
  const kept = [];
  for (const k of want) {
    const prev = kept[kept.length - 1];
    if (prev != null && (k - prev) * spacing < room) {
      if (k === count) kept[kept.length - 1] = k; // the last always shows
      continue;
    }
    kept.push(k);
  }
  return kept;
}

// A dimension over [x1, x2]. Its label sits in the line's gap when it fits;
// otherwise above it, flush with the outer end so the done and estimate
// labels pull apart instead of meeting in the middle.
// `textAt` overrides the outer end for the label (to clear its neighbour).
const spanFits = (x1, x2, label) => x2 - x1 > textWidth(label) + 20;

function Span({ x1, x2, label, color, anchor, textAt }) {
  if (spanFits(x1, x2, label)) return <Dim x1={x1} x2={x2} y={DIM_Y} label={label} color={color} />;
  return (
    <g>
      {x2 - x1 >= 12 && <Dim x1={x1} x2={x2} y={DIM_Y} />}
      <T x={textAt ?? (anchor === 'end' ? x2 : x1)} y={DIM_Y - 7} anchor={anchor} color={color}>{label}</T>
    </g>
  );
}

/** The drawing at a given width, pure so it can be rendered headless. */
export function Fig16Drawing({ plan, width, compact = false }) {
  const r = chunkRuler(plan);
  const count = r.nodes.length;
  const tally = `${r.done}/${r.total}`;
  const x0 = PAD;
  const x1 = compact ? width - PAD : width - textWidth(tally) - 10;
  const spacing = count > 1 ? (x1 - x0) / (count - 1) : 0;
  const xAt = (i) => (count > 1 ? x0 + i * spacing : x0);
  const size = count > 1 ? Math.max(3, Math.min(8, spacing - 2)) : 8;

  // Ink runs to the live node, or to the last done one when nothing is live.
  const inkTo = r.live >= 0 ? r.live : r.lastDone;

  const doneLabel = r.spent != null ? `${r.done} done · ${formatDuration(r.spent)}` : `${r.done} done`;
  const doneX2 = r.lastDone >= 0 ? xAt(r.lastDone) : null;
  const estLabel = r.estimate != null ? `≈ ${formatDuration(r.estimate)}` : null;
  // Both labels above the line: keep the estimate clear of the done label.
  const doneEnd = doneX2 != null && !spanFits(x0, doneX2, doneLabel) ? x0 + textWidth(doneLabel) : -Infinity;
  const estAt = estLabel ? Math.min(width, Math.max(x1, doneEnd + 16 + textWidth(estLabel))) : null;

  return (
    <g>
      {count > 1 && (
        <line x1={x0} x2={x1} y1={LINE_Y} y2={LINE_Y} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
      )}
      {inkTo > 0 && (
        <line x1={x0} x2={xAt(inkTo)} y1={LINE_Y} y2={LINE_Y} style={{ stroke: INK.fg, strokeWidth: STROKE.ink }} />
      )}

      {doneX2 != null && !compact && (
        <Span x1={x0} x2={doneX2} label={doneLabel} color={INK.muted} anchor="start" />
      )}
      {estLabel && !compact && (
        <Span x1={doneX2} x2={x1} label={estLabel} color={INK.lamp} anchor="end" textAt={estAt} />
      )}

      {r.nodes.map((nd, i) => {
        const x = xAt(i);
        const h = size / 2 + 1;
        return (
          <g key={nd.n}>
            <Node x={x} y={LINE_Y} state={nd.state} size={size} />
            {nd.struck && (
              <line
                x1={x - h}
                y1={LINE_Y + h}
                x2={x + h}
                y2={LINE_Y - h}
                style={{ stroke: INK.muted, strokeWidth: STROKE.hair }}
              />
            )}
          </g>
        );
      })}

      {!compact && indexLabels(count, spacing).map((k) => (
        <T key={k} x={xAt(k - 1)} y={LINE_Y + 17} color={INK.faint} anchor="middle">
          {k}
        </T>
      ))}

      {!compact && (
        <T x={width} y={LINE_Y + 4} anchor="end">
          <tspan style={{ fill: r.done > 0 ? INK.fg : INK.muted }}>{r.done}</tspan>/{r.total}
        </T>
      )}
    </g>
  );
}

/**
 * The tab plan tier's ruler, laid out at its container's width. Narrower than
 * MIN_W it shows `fallback`. `label` leads the tooltip; the times follow it.
 */
export function Fig16Chunks({ plan, label, fallback }) {
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

  const width = Math.max(compact ? C_MIN_W : MIN_W, Math.min(MAX_W, Math.floor(rootW ?? 240)));
  const r = chunkRuler(plan);
  const sentence = `${[
    label || `${r.done} of ${r.total} chunks implemented`,
    r.spent != null && `${formatDuration(r.spent)} of work`,
    r.estimate != null && `about ${formatDuration(r.estimate)} left at this pace`,
  ].filter(Boolean).join(', ')}.`;

  return (
    <div ref={rootRef} className="min-w-0" title={sentence}>
      <Figure
        fig="chunks"
        viewBox={`0 0 ${width} ${H}`}
        compactViewBox={`0 ${LINE_Y - C_H / 2} ${width} ${C_H}`}
        minWidth={MIN_W}
        compactMinWidth={C_MIN_W}
        paper="var(--ins-well)"
        label={sentence}
        fallback={fallback}
      >
        <Fig16Drawing plan={plan} width={width} compact={compact} />
      </Figure>
    </div>
  );
}
