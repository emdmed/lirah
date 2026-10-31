import { useLayoutEffect, useRef, useState } from 'react';
import { Box, Dim, Figure, INK, Leader, Node, STROKE, T, textWidth } from '@/components/instrument/figure';
import { formatDuration } from '../../lib/formatDuration';
import { useTick } from '../../hooks/useTick';
import { useSetting } from '../settings/settingsStore';
import { AUTOPILOT_STATUS, CHUNK_STATUS, planProgress } from './planModel';

// FIG.20: the plan's working time, one span per implemented chunk laid end to
// end by its own duration. Idle time between chunks is folded out; a gap over
// two minutes leaves a ≈ break in the line and the ruler. The minutes ruler
// measures working time only. The slowest span is drawn heavy and called out.
// A dimension over the whole plan gives the run's wall time (auto-pilot) or
// the summed chunk time (by hand); with a wall time, the idle remainder is
// written beside it, so work + idle = the total.

const MIN_W = 260;
const MAX_W = 560;
const PAD = 4;
const DIM_Y = 30;
const NUM_Y = 53;
const LINE_Y = 61;
const RULER_Y = 73;
const BOX_Y = 101;
const BREAK_AFTER = 2 * 60_000;
const BREAK_W = 12;

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
  const slowest = done.length >= 2 ? done.reduce((a, s) => (s.dur > a.dur ? s : a)) : null;
  return { spans, work, total, idle, kind, slowest, running };
}

// Ruler steps in minutes: a minor tick and a labelled one. Every 5 min (every
// 30 past two hours), doubled while the labels would touch.
function rulerSteps(workMin, pxPerMin) {
  const long = workMin > 120;
  const minor = long ? 10 : 1;
  let major = long ? 30 : 5;
  while (major * pxPerMin < textWidth('1h30') + 8) major *= 2;
  return { minor: minor * pxPerMin < 3 ? major : minor, major };
}

const fmtMin = (m) => (m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m / 60}h`);

const clip = (s, max) => (s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`);

/** The drawing at a given width, pure so it can be rendered headless. */
export function Fig20Drawing({ plan, width, now, showCount = true }) {
  const t = planTimeline(plan, now);
  const { spans, work } = t;
  const { done: doneN, total: totalN } = planProgress(plan);
  const count = `${doneN}/${totalN}`;

  const x0 = PAD;
  const x1 = showCount ? width - textWidth(count) - 10 : width - PAD;
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

  // Ruler: ticks on working minutes, broken where the line breaks.
  const workMin = work / 60_000;
  const pxPerMin = k * 60_000;
  const { minor, major } = rulerSteps(workMin, pxPerMin);
  const ticks = [];
  for (let m = 0; m <= workMin + 1e-9; m += minor) {
    const tx = xAtWork(m * 60_000);
    const isMajor = m % major === 0;
    ticks.push(
      <g key={m}>
        <line x1={tx} x2={tx} y1={RULER_Y} y2={RULER_Y + (isMajor ? 6 : 3)} style={{ stroke: isMajor ? INK.faint : INK.edgeStrong, strokeWidth: STROKE.hair }} />
        {isMajor && (
          <T x={tx} y={RULER_Y + 17} color={INK.faint} anchor={m === 0 ? 'start' : 'middle'} halo>{m === 0 ? '0' : fmtMin(m)}</T>
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

  const dimLabel = `${t.kind} · ${formatDuration(t.total)}`;
  const idleText = t.idle != null && t.idle >= 1000 ? `≈ idle ${formatDuration(t.idle)}` : null;
  const idleW = idleText ? textWidth(idleText) : 0;

  // The slowest span's callout, under the ruler, kept clear of the idle note.
  let box = null;
  let leader = null;
  if (t.slowest) {
    const s = laid.find((l) => l.n === t.slowest.n && !l.live);
    const value = `chunk ${s.n} · ${formatDuration(s.dur)}`;
    const room = width - (idleText ? idleW + 24 : 0);
    const prefix = 'slowest · ';
    const maxChars = Math.max(4, Math.floor((Math.min(room, 360) - 14) / (textWidth('x') * 1.08)) - prefix.length);
    const label = `${prefix}${clip(s.title || `chunk ${s.n}`, maxChars)}`;
    // The legend face runs a little wider than CH; pad so text never meets the edge.
    const bw = Math.max(textWidth(label), textWidth(value)) * 1.08 + 14;
    const mid = (s.a + s.b) / 2;
    const bx = Math.max(0, Math.min(room - bw, mid - 12));
    // Drawn before the ruler, so it breaks at the minute numbers.
    leader = <Leader points={[[mid, LINE_Y + 2], [mid, BOX_Y]]} />;
    box = <Box x={bx} y={BOX_Y} width={bw} label={label} value={value} />;
  }

  return (
    <g>
      <Dim x1={x0} x2={Math.max(xEnd, x0 + 12)} y={DIM_Y} label={dimLabel} color={INK.fg} />

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
          {breakW >= 6 && (
            <>
              <T x={s.a - breakW / 2} y={LINE_Y + 4} anchor="middle" color={INK.faint}>≈</T>
              <T x={s.a - breakW / 2} y={RULER_Y + 4} anchor="middle" color={INK.faint}>≈</T>
            </>
          )}
        </g>
      ))}

      {laid.map((s) => <Node key={`d${s.n}`} x={s.b} y={LINE_Y} state={s.live ? 'live' : 'done'} size={s.live ? 6 : 5} />)}
      {nums}

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
      {idleText && <T x={width} y={BOX_Y + 13} anchor="end" color={INK.faint}>{idleText}</T>}
      {box}
    </g>
  );
}

/** How tall the drawing is: the callout box adds a row. */
const heightFor = (plan, now) => (planTimeline(plan, now).slowest ? BOX_Y + 36 : RULER_Y + 22);

/**
 * The plan's timeline, laid out at its container's width. With no timed
 * chunk to draw, narrower than MIN_W, or in compact figures, it shows
 * `fallback`. `showCount` draws the done/total count at the line's end.
 */
export function Fig20Timeline({ plan, fallback, showCount = true, paper = 'var(--ins-panel)' }) {
  const rootRef = useRef(null);
  const [rootW, setRootW] = useState(null);
  const running = plan.autopilot?.status === AUTOPILOT_STATUS.RUNNING;
  const now = useTick(running);
  const [figures] = useSetting('figures');

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    setRootW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setRootW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const t = planTimeline(plan, now);
  if (figures === 'compact' || !t.spans.length || !(t.work > 0)) return fallback;

  const width = Math.max(MIN_W, Math.min(MAX_W, Math.floor(rootW ?? 320)));
  const height = heightFor(plan, now);
  const label = [
    `${t.kind} ${formatDuration(t.total)}`,
    `${t.spans.length} chunk${t.spans.length === 1 ? '' : 's'} worked ${formatDuration(t.work)}`,
    t.idle != null && `idle ${formatDuration(t.idle)}`,
    t.slowest && `slowest chunk ${t.slowest.n}, ${formatDuration(t.slowest.dur)}`,
  ].filter(Boolean).join('; ');

  return (
    <div ref={rootRef} className="min-w-0" title={label}>
      <Figure
        fig="timeline"
        viewBox={`0 0 ${width} ${height}`}
        minWidth={MIN_W}
        paper={paper}
        label={label}
        fallback={fallback}
      >
        <Fig20Drawing plan={plan} width={width} now={now} showCount={showCount} />
      </Figure>
    </div>
  );
}
