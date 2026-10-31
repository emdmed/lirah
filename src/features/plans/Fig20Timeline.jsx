import { useLayoutEffect, useRef, useState } from 'react';
import { DASH, Dim, Figure, INK, Leader, Node, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { formatDuration } from '../../lib/formatDuration';
import { useTick } from '../../hooks/useTick';
import { AUTOPILOT_STATUS, CHUNK_STATUS, planProgress } from './planModel';

// FIG.20: the plan's working time, one span per implemented chunk laid end to
// end by its own duration. Idle time between chunks is folded out; a gap over
// two minutes leaves a ≈ break in the line and the ruler. The minutes ruler
// measures working time only. The slowest span is drawn heavy and called out.
// A dimension over the whole plan gives the run's wall time (auto-pilot) or
// the summed chunk time (by hand); with a wall time, the idle remainder is
// written into its label, so work + idle = the total. What's still ahead
// follows as an unmeasured dashed tail: a chunk stuck without its commit is
// a warn square at its head, and the tail is labelled with what's left.
// Compact keeps the spans, nodes, breaks, tail and the ruler's ticks; the
// times, numbers and the slowest note move to the tooltip.

const MIN_W = 260;
const C_MIN_W = 120; // compact has no text to keep at 1:1
const MAX_W = 560;
const PAD = 4;
const DIM_Y = 30;
const NUM_Y = 53;
const LINE_Y = 61;
const RULER_Y = 73;
const NOTE_Y = 103;
const BREAK_AFTER = 2 * 60_000;
const BREAK_W = 12;
const IDLE_NOTE = 30_000;

const timed = (c) => c.startedAt && c.doneAt && c.doneAt >= c.startedAt;

/**
 * The timeline's numbers, pure. `now` closes the live chunk's span while
 * auto-pilot runs. Spans are in start order; `gapBefore` is the idle time
 * since the previous span ended (0 for the first). `total` is the wall time
 * of the run when auto-pilot covered every span, else the summed work.
 */
export function planTimeline(plan, now = Date.now()) {
  const ap = plan.autopilot || {};
  const running = ap.status === AUTOPILOT_STATUS.RUNNING;
  const spans = plan.chunks
    .filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED && timed(c))
    .map((c) => ({ n: c.n, title: c.title, start: c.startedAt, end: c.doneAt, live: false }));
  const liveChunk = running
    ? plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS && c.startedAt && c.startedAt <= now)
    : null;
  if (liveChunk) spans.push({ n: liveChunk.n, title: liveChunk.title, start: liveChunk.startedAt, end: now, live: true });
  spans.sort((a, b) => a.start - b.start);

  let prevEnd = null;
  for (const s of spans) {
    s.dur = s.end - s.start;
    s.gapBefore = prevEnd == null ? 0 : Math.max(0, s.start - prevEnd);
    s.broken = s.gapBefore > BREAK_AFTER;
    prevEnd = prevEnd == null ? s.end : Math.max(prevEnd, s.end);
  }
  const work = spans.reduce((a, s) => a + s.dur, 0);

  // Auto-pilot's wall time only when every span falls inside its window;
  // chunks run by hand before it started would overrun the total.
  const windowEnd = ap.status === AUTOPILOT_STATUS.DONE ? ap.endedAt : running ? now : null;
  const inWindow = ap.startedAt && windowEnd && spans.every((s) => s.start >= ap.startedAt && s.end <= windowEnd);
  const kind = inWindow ? (running ? 'elapsed' : 'complete') : 'chunks';
  const total = inWindow ? windowEnd - ap.startedAt : work;
  const idle = inWindow ? Math.max(0, total - work) : null;

  const done = spans.filter((s) => !s.live);
  // A look back, so it waits until auto-pilot isn't running.
  const slowest = !running && done.length >= 2 ? done.reduce((a, s) => (s.dur > a.dur ? s : a)) : null;
  // Ahead: a chunk sent but not committed (outside a live run), and what's left after it.
  const stuck = liveChunk ? null : plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS) ?? null;
  const left = plan.chunks.filter((c) => c.status !== CHUNK_STATUS.IMPLEMENTED && c.status !== CHUNK_STATUS.SKIPPED
    && c.id !== liveChunk?.id).length;
  return { spans, work, total, idle, kind, slowest, running, stuck, left };
}

// Ruler steps as [labelled, minor] in ms: the smallest whose labels don't
// touch, so a 20-second run gets a seconds scale and a long one 30-minute marks.
const SEC = 1000;
const MINUTE = 60 * SEC;
const STEPS = [
  [5 * SEC, SEC], [10 * SEC, 2 * SEC], [15 * SEC, 5 * SEC], [30 * SEC, 5 * SEC],
  [MINUTE, 10 * SEC], [2 * MINUTE, 30 * SEC], [5 * MINUTE, MINUTE], [10 * MINUTE, MINUTE],
  [15 * MINUTE, 5 * MINUTE], [30 * MINUTE, 10 * MINUTE], [60 * MINUTE, 10 * MINUTE], [120 * MINUTE, 30 * MINUTE],
];
function rulerSteps(pxPerMs) {
  const room = textWidth('1h30') + 8;
  const [major, minor] = STEPS.find(([m]) => m * pxPerMs >= room) ?? STEPS[STEPS.length - 1];
  return { major, minor: minor * pxPerMs < 3 ? major : minor };
}

const fmtTick = (ms) => (ms < MINUTE ? `${Math.round(ms / SEC)}s` : fmtMin(Math.round(ms / MINUTE)));

const fmtMin = (m) => (m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m / 60}h`);

// The dimension's word for its total: the run's wall time, or the summed work.
const KIND_LABEL = { chunks: 'worked' };

/** The drawing at a given width, pure so it can be rendered headless. */
export function Fig20Drawing({ plan, width, now, showCount: showCountProp = true, compact = false }) {
  const showCount = showCountProp && !compact;
  const t = planTimeline(plan, now);
  const { spans, work } = t;
  const { done: doneN, total: totalN } = planProgress(plan);
  const count = `${doneN}/${totalN}`;

  const x0 = PAD;
  const xLimit = showCount ? width - textWidth(count) - 10 : width - PAD;
  // The tail ahead takes a fixed share, sized to its label; spans scale into the rest.
  const leftLabel = t.left > 0 ? `${t.left} left` : '';
  const tailW = t.left > 0 ? Math.min(Math.max(textWidth(leftLabel) + 16, (xLimit - x0) * 0.18), (xLimit - x0) * 0.35) : 0;
  const x1 = xLimit - tailW;
  const breaks = spans.filter((s) => s.broken).length;
  const breakW = breaks ? Math.min(BREAK_W, ((x1 - x0) * 0.3) / breaks) : 0;
  const k = work > 0 ? (x1 - x0 - breakW * breaks) / work : 0;

  // Lay spans end to end; a break shifts everything after it right.
  let x = x0;
  const laid = spans.map((s) => {
    if (s.broken) x += breakW;
    const a = x;
    x += s.dur * k;
    return { ...s, a, b: x };
  });
  const xEnd = laid.length ? laid[laid.length - 1].b : x0;
  // Working time → x, skipping the breaks before it.
  const xAtWork = (ms) => {
    let acc = 0;
    let shift = 0;
    for (const s of spans) {
      if (s.broken && ms > acc) shift += breakW;
      acc += s.dur;
      if (ms <= acc) break;
    }
    return x0 + ms * k + shift;
  };

  // Ruler: ticks on working time, broken where the line breaks.
  const { minor, major } = rulerSteps(k);
  const every = Math.round(major / minor);
  const ticks = [];
  for (let i = 0; i * minor <= work; i += 1) {
    const ms = i * minor;
    const tx = xAtWork(ms);
    const isMajor = i % every === 0;
    ticks.push(
      <g key={i}>
        <line x1={tx} x2={tx} y1={RULER_Y} y2={RULER_Y + (isMajor ? 6 : 3)} style={{ stroke: isMajor ? INK.faint : INK.edgeStrong, strokeWidth: STROKE.hair }} />
        {isMajor && !compact && (
          <T x={tx} y={RULER_Y + 17} color={INK.faint} anchor={i === 0 ? 'start' : 'middle'} halo>{i === 0 ? '0' : fmtTick(ms)}</T>
        )}
      </g>,
    );
  }
  // Baseline segments for the line and the ruler, split at the breaks.
  const segs = [];
  let segStart = x0;
  laid.forEach((s) => {
    if (s.broken) {
      segs.push([segStart, s.a - breakW]);
      segStart = s.a;
    }
  });
  segs.push([segStart, xEnd]);

  // Chunk numbers over the end nodes, skipping any that would touch the last.
  let lastLabelEnd = -Infinity;
  const nums = laid.map((s) => {
    const w = textWidth(String(s.n));
    if (s.b - w / 2 < lastLabelEnd + 4) return null;
    lastLabelEnd = s.b + w / 2;
    return <T key={`n${s.n}`} x={s.b} y={NUM_Y - 6} anchor="middle" color={s.live ? INK.lamp : INK.muted}>{s.n}</T>;
  });

  // Idle rides on the total it is part of; a few seconds of start-up isn't worth a word.
  const idle = t.idle != null && t.idle >= IDLE_NOTE ? ` · ${formatDuration(t.idle)} idle` : '';
  const dimLabel = `${KIND_LABEL[t.kind] ?? t.kind} · ${formatDuration(t.total)}${idle}`;

  // The slowest span, named under the ruler: a settled fact, so a leader and
  // a line of text, not a box (boxes are for live state).
  let note = null;
  let leader = null;
  if (t.slowest && !compact) {
    const s = laid.find((l) => l.n === t.slowest.n && !l.live);
    const mid = (s.a + s.b) / 2;
    const text = `slowest · chunk ${s.n} · ${formatDuration(s.dur)}`;
    const tw = textWidth(text);
    // Text to the right of the elbow when it fits, else to the left.
    const right = mid + 9 + tw <= width;
    const elbow = right ? mid + 5 : mid - 5;
    // Drawn before the ruler, so it breaks at the minute numbers.
    leader = <Leader points={[[mid, LINE_Y + 2], [mid, NOTE_Y], [elbow, NOTE_Y]]} />;
    note = (
      <g>
        <title>{s.title || `chunk ${s.n}`}</title>
        <T x={right ? mid + 9 : mid - 9} y={NOTE_Y + 4} anchor={right ? 'start' : 'end'} color={INK.muted}>{text}</T>
      </g>
    );
  }

  // Ahead: unmeasured, so dashed and off the ruler.
  const tail = t.left > 0 ? (() => {
    const a = xEnd + 2;
    const b = xEnd + tailW;
    // Clear of the last span's number above it.
    const lastN = laid.length ? String(laid[laid.length - 1].n) : '';
    const sx = xEnd + Math.max(10, (textWidth(lastN) + textWidth(String(t.stuck?.n ?? ''))) / 2 + 5);
    return (
      <g>
        <title>{`${t.left} chunk${t.left === 1 ? '' : 's'} left${t.stuck ? `; chunk ${t.stuck.n} has no commit yet` : ''}`}</title>
        <line x1={a} x2={b} y1={LINE_Y} y2={LINE_Y} style={{ stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.medium }} />
        {t.stuck && (
          <>
            <rect x={sx - 3} y={LINE_Y - 3} width={6} height={6} style={{ fill: INK.paper, stroke: INK.warn, strokeWidth: STROKE.ink }} />
            {!compact && <T x={sx} y={NUM_Y - 6} anchor="middle" color={INK.warn}>{t.stuck.n}</T>}
          </>
        )}
        {!compact && <T x={b} y={RULER_Y + 17} anchor="end" color={INK.faint}>{leftLabel}</T>}
      </g>
    );
  })() : null;

  return (
    <g>
      {!compact && <Dim x1={x0} x2={Math.max(xEnd, x0 + 12)} y={DIM_Y} label={dimLabel} color={INK.fg} />}

      {/* The plan's start. */}
      <line x1={x0} x2={x0} y1={LINE_Y - 5} y2={LINE_Y + 5} style={{ stroke: INK.faint, strokeWidth: STROKE.hair }} />

      {laid.map((s) => (
        <line
          key={`s${s.n}`}
          x1={s.a}
          x2={s.b}
          y1={LINE_Y}
          y2={LINE_Y}
          style={{
            stroke: s.live ? INK.lamp : INK.fg,
            strokeWidth: t.slowest && s.n === t.slowest.n && !s.live ? STROKE.heavy : STROKE.ink,
            strokeDasharray: s.live ? '4 3' : undefined,
          }}
        />
      ))}

      {laid.filter((s) => s.broken).map((s) => (
        <g key={`b${s.n}`}>
          <title>{`idle ${formatDuration(s.gapBefore)}`}</title>
          {breakW >= 6 && !compact && (
            <>
              <T x={s.a - breakW / 2} y={LINE_Y + 4} anchor="middle" color={INK.faint}>≈</T>
              <T x={s.a - breakW / 2} y={RULER_Y + 4} anchor="middle" color={INK.faint}>≈</T>
            </>
          )}
        </g>
      ))}

      {laid.map((s) => <Node key={`d${s.n}`} x={s.b} y={LINE_Y} state={s.live ? 'live' : 'done'} size={s.live ? 6 : 5} />)}
      {!compact && nums}
      {tail}

      {leader}
      {segs.map(([a, b]) => (
        <line key={`r${a}`} x1={a} x2={b} y1={RULER_Y} y2={RULER_Y} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      ))}
      {ticks}

      {showCount && (
        <T x={width} y={LINE_Y + 4} anchor="end">
          <tspan style={{ fill: doneN > 0 ? INK.fg : INK.muted }}>{doneN}</tspan>/{totalN}
        </T>
      )}
      {note}
    </g>
  );
}

/** How tall the drawing is: the slowest note adds a row. */
const heightFor = (plan, now) => (planTimeline(plan, now).slowest ? NOTE_Y + 10 : RULER_Y + 22);

/** Compact: the line and the ruler's ticks. */
const C_TOP = LINE_Y - 8;
const C_H = RULER_Y + 8 - C_TOP;

/**
 * The plan's timeline, laid out at its container's width. With no timed
 * chunk to draw, or narrower than MIN_W, it shows `fallback`. `showCount`
 * draws the done/total count at the line's end.
 */
export function Fig20Timeline({ plan, fallback, showCount = true, paper = 'var(--ins-panel)' }) {
  const rootRef = useRef(null);
  const [rootW, setRootW] = useState(null);
  const running = plan.autopilot?.status === AUTOPILOT_STATUS.RUNNING;
  const now = useTick(running);
  const compact = useFigureCompact();

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    setRootW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setRootW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The measured box renders even while the fallback shows, so the width is
  // known by the time the first chunk has a time to draw.
  const t = planTimeline(plan, now);
  if (!t.spans.length || !(t.work > 0)) {
    return <div ref={rootRef} className="min-w-0">{fallback}</div>;
  }

  const width = Math.max(compact ? C_MIN_W : MIN_W, Math.min(MAX_W, Math.floor(rootW ?? 320)));
  const height = heightFor(plan, now);
  const { done: doneN, total: totalN } = planProgress(plan);
  const label = `Plan timeline, ${doneN} of ${totalN} chunks: ${[
    `${KIND_LABEL[t.kind] ?? t.kind} ${formatDuration(t.total)}`,
    `${t.spans.length} chunk${t.spans.length === 1 ? '' : 's'} worked ${formatDuration(t.work)}`,
    t.idle != null && `idle ${formatDuration(t.idle)}`,
    t.slowest && `slowest chunk ${t.slowest.n}, ${formatDuration(t.slowest.dur)}`,
    t.stuck && `chunk ${t.stuck.n} has no commit yet`,
    t.left > 0 && `${t.left} left`,
  ].filter(Boolean).join('; ')}.`;

  return (
    <div ref={rootRef} className="min-w-0" title={label}>
      <Figure
        fig="timeline"
        viewBox={`0 0 ${width} ${height}`}
        compactViewBox={`0 ${C_TOP} ${width} ${C_H}`}
        minWidth={MIN_W}
        compactMinWidth={C_MIN_W}
        paper={paper}
        label={label}
        fallback={fallback}
      >
        <Fig20Drawing plan={plan} width={width} now={now} showCount={showCount} compact={compact} />
      </Figure>
    </div>
  );
}
