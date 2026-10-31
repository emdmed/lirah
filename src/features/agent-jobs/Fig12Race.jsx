import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Figure, INK, STROKE, DASH, CH, T, Dim, Node, Ruler, textWidth } from '@/components/instrument/figure';
import { formatTimer } from '../../lib/formatDuration';
import { useTick } from '../../hooks/useTick';
import { usePageVisible } from '../../hooks/usePageVisible';
import { durationStep, fmtSecs } from '../../components/instrument/Span';

// FIG 12: a race as lanes. One lane per candidate on a shared time scale,
// from its start to its end (or now), with a dimension line giving its
// duration. Done lanes are ink with a filled node, the running lane is the
// only lit one (lamp, live star, dashed tail), failed lanes are fault with ×.
// The full version adds an end box per lane (typecheck over diff) and a
// ruler; `short` is just lanes and durations, for the sidebar race group.
//
// Laid out at the container's width, so the drawing is always 1:1.

const MIN_W = { full: 360, short: 160 };
const MAX_W = { full: 720, short: 480 };
const ROW = { full: 44, short: 30 };
const TOP = { full: 22, short: 18 };
const NAME_CHARS = 12;
const BOX_GAP = 14;

// A candidate's own label is the race label plus its agent; next to the
// other candidates only the distinguishing tail matters.
export function shortLabel(job) {
  const tail = job.label?.split(' · ').pop();
  return tail || job.cli;
}

// The race's label: a candidate's label without its agent suffix.
function raceLabel(job) {
  const parts = (job?.label || '').split(' · ');
  return parts.length > 1 ? parts.slice(0, -1).join(' · ') : parts[0];
}

function fit(text, chars) {
  const s = String(text);
  return s.length <= chars ? s : `${s.slice(0, Math.max(1, chars - 1))}…`;
}

// Ruler steps and numbers come from the shared duration scale (P6, Span.jsx).
const rulerStep = (maxSecs, width) => durationStep(maxSecs, width);

function laneState(job) {
  if (job.status === 'running') return 'live';
  if (job.status === 'failed') return 'failed';
  if (job.status === 'cancelled' || job.status === 'interrupted') return 'stopped';
  return 'done';
}
const LANE_INK = { live: INK.lamp, failed: INK.fault, stopped: INK.muted, done: INK.fg };

// End box text: typecheck over diff. Pure, for reuse and tests.
export function endBox(job) {
  const tc = job.typecheck;
  let check = { text: 'unchecked', color: INK.faint };
  if (tc?.status === 'checking') check = { text: 'tsc …', color: INK.muted };
  else if (tc?.status === 'done') {
    check = tc.errorCount > 0
      ? { text: `tsc ${tc.errorCount} error${tc.errorCount === 1 ? '' : 's'}`, color: INK.fault }
      : { text: 'tsc ok', color: INK.ok };
  }
  const stat = job.diffStat;
  const diff = job.status === 'running'
    ? { running: true }
    : stat && (stat.added > 0 || stat.removed > 0)
      ? { added: stat.added, removed: stat.removed }
      : { none: true };
  return { check, diff };
}
const diffText = (d) => (d.running ? '…' : d.none ? 'no changes' : `+${d.added} −${d.removed}`);

export function Fig12Race({ jobs, short = false, fallback = null }) {
  const rootRef = useRef(null);
  const [rootW, setRootW] = useState(null);
  const anyRunning = jobs.some((j) => j.status === 'running');
  // Redraws each second only while a lane is live and the window is shown.
  const visible = usePageVisible();
  const now = useTick(anyRunning && visible);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    setRootW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setRootW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mode = short ? 'short' : 'full';
  const width = Math.min(MAX_W[mode], Math.floor(rootW ?? 256));

  const boxes = useMemo(() => jobs.map(endBox), [jobs]);
  const boxW = short
    ? 0
    : Math.max(...boxes.map((b) => Math.max(textWidth(b.check.text), textWidth(diffText(b.diff))))) + 18;

  if (jobs.length === 0 || (rootW != null && width < MIN_W[mode])) return <div ref={rootRef}>{fallback}</div>;

  const names = jobs.map((j) => fit(shortLabel(j), short ? 8 : NAME_CHARS));
  const nameW = Math.max(...names.map((n) => textWidth(n))) + 10;
  const laneX0 = nameW;
  const laneX1 = short ? width - 4 : width - boxW - BOX_GAP;
  const laneW = Math.max(1, laneX1 - laneX0);

  const starts = jobs.map((j) => j.startedAt).filter(Boolean);
  const t0 = starts.length ? Math.min(...starts) : now;
  const endOf = (j) => (j.status === 'running' ? now : j.endedAt || now);
  let span = Math.max(1000, ...jobs.map((j) => endOf(j) - t0));
  // Leave room after "now" for the live lane's dashed tail.
  if (anyRunning) span = Math.max(span, now - t0) * 1.15;
  const xOf = (t) => laneX0 + Math.min(1, Math.max(0, (t - t0) / span)) * laneW;

  const row = ROW[mode];
  const top = TOP[mode];
  const lanesBottom = top + jobs.length * row;
  const rulerY = lanesBottom + 4;
  const height = short ? lanesBottom : rulerY + 22;
  const maxSecs = span / 1000;
  const step = rulerStep(maxSecs, laneW);

  const prefix = 'FIG.12 RACE ·  · ';
  const tail = `${jobs.length} AGENT${jobs.length === 1 ? '' : 'S'}`;
  const room = Math.floor(width / (CH + 0.5)) - prefix.length - tail.length;
  const title = short ? '' : `RACE · ${fit(raceLabel(jobs[0]), Math.max(4, room))} · ${tail}`;

  return (
    <div ref={rootRef}>
      <Figure
        fig="race"
        title={title}
        viewBox={`0 0 ${width} ${height}`}
        minWidth={MIN_W[mode]}
        paper="var(--ins-panel)"
        label={`${jobs.length} race candidates as lanes over time`}
        fallback={fallback}
      >
        {jobs.map((job, i) => {
          const rowTop = top + i * row;
          const y = rowTop + (short ? 8 : 11);
          const dimY = rowTop + (short ? 21 : 27);
          const state = laneState(job);
          const ink = LANE_INK[state];
          const xs = xOf(job.startedAt || t0);
          const xe = Math.max(xs + 1, xOf(endOf(job)));
          const dur = job.startedAt ? formatTimer(endOf(job) - job.startedAt) : '—';
          const box = boxes[i];
          const durInk = state === 'live' ? INK.lamp : INK.muted;
          return (
            <g key={job.id}>
              <T x={0} y={y + 4} color={state === 'live' ? INK.fg : INK.muted}>{names[i]}</T>
              <line
                x1={xs}
                x2={xe}
                y1={y}
                y2={y}
                style={{ stroke: ink, strokeWidth: state === 'live' ? STROKE.emphasis : STROKE.ink }}
              />
              {state === 'live' && (
                <>
                  <line
                    x1={xe}
                    x2={laneX1}
                    y1={y}
                    y2={y}
                    style={{ stroke: INK.lamp, strokeWidth: STROKE.hair, strokeDasharray: DASH.medium }}
                  />
                  <Node x={xe} y={y} state="live" size={short ? 5 : 6} />
                </>
              )}
              {state === 'done' && <Node x={xe} y={y} state="done" size={short ? 6 : 7} />}
              {state === 'stopped' && <Node x={xe} y={y} state="todo" size={short ? 6 : 7} />}
              {state === 'failed' && (
                <path
                  d={`M${xe - 3.5} ${y - 3.5}l7 7M${xe + 3.5} ${y - 3.5}l-7 7`}
                  style={{ fill: 'none', stroke: INK.fault, strokeWidth: STROKE.emphasis }}
                />
              )}
              {/* Too short to write the time into the line: write it after the end tick. */}
              {xe - xs > textWidth(dur) + 20 ? (
                <Dim x1={xs} x2={xe} y={dimY} label={dur} color={durInk} />
              ) : (
                <>
                  <Dim x1={xs} x2={xe} y={dimY} label="" />
                  <T x={xe + 6} y={dimY + 3.5} color={durInk}>{dur}</T>
                </>
              )}

              {!short && (
                <g>
                  {state !== 'live' && xe + 6 < laneX1 + BOX_GAP && (
                    <path
                      d={`M${xe + 6} ${y}H${laneX1 + BOX_GAP}`}
                      style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.sparse }}
                    />
                  )}
                  <rect
                    x={width - boxW}
                    y={rowTop + 1}
                    width={boxW - 0.5}
                    height={32}
                    style={{ fill: INK.paper, stroke: INK.edgeStrong, strokeWidth: STROKE.hair }}
                  />
                  <T x={width - boxW + 7} y={rowTop + 14} color={box.check.color}>{box.check.text}</T>
                  {box.diff.added != null ? (
                    <T x={width - boxW + 7} y={rowTop + 27}>
                      <tspan style={{ fill: INK.ok }}>+{box.diff.added}</tspan>
                      <tspan style={{ fill: INK.fault }}>{` −${box.diff.removed}`}</tspan>
                    </T>
                  ) : (
                    <T x={width - boxW + 7} y={rowTop + 27} color={INK.faint}>{diffText(box.diff)}</T>
                  )}
                </g>
              )}
            </g>
          );
        })}
        {!short && <Ruler x0={laneX0} x1={laneX1} y={rulerY} max={maxSecs} step={step} fmt={fmtSecs} />}
      </Figure>
    </div>
  );
}
