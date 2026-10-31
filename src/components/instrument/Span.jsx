import { createContext, useContext, useMemo } from 'react';
import { CH, DASH, INK, Node, Ruler, STROKE, T, useFigureCompact } from '@/components/instrument/figure';
import { formatTimer } from '../../lib/formatDuration';
import { useTick } from '../../hooks/useTick';
import { usePageVisible } from '../../hooks/usePageVisible';

// P6: a duration drawn as a dimension line. When several sit in one list they
// share a time scale (SpanScale) and the list prints its ruler once at the top
// (SpanRuler), so the lines compare at a glance. A running item ends in the
// lamp star and a dashed lamp tail, redrawn at most once a second. Full draws
// end ticks and prints the value after the line; compact keeps the line and
// the value. Every Span has the same width, so values line up in a column
// under the ruler.

const TRACK = 60;
const GAP = 6;
const VALUE_W = 7 * CH; // "12m 40s"
const H = 14;
const TAIL = 12;
export const SPAN_WIDTH = TRACK + GAP + VALUE_W;

// Ruler steps in seconds, shared with FIG.12's lanes.
const STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600];

/** The first step that leaves `minGap` px between ticks over `width` px. */
export function durationStep(maxSecs, width, minGap = 44) {
  return STEPS.find((s) => (s / maxSecs) * width >= minGap) || STEPS[STEPS.length - 1];
}

/** Seconds as a ruler number: 45s, 5m, 2m30s, 1h. */
export function fmtSecs(v) {
  if (v < 60) return `${v}s`;
  if (v >= 3600 && v % 3600 === 0) return `${v / 3600}h`;
  const m = Math.floor(v / 60);
  const s = v % 60;
  return s ? `${m}m${s}s` : `${m}m`;
}

/** A list's scale, pure: the longest duration rounded up to a whole step. */
export function spanScale(maxMs, width = TRACK) {
  const secs = Math.max(1, maxMs / 1000);
  const step = durationStep(secs, width, 10);
  return { max: Math.ceil(secs / step) * step * 1000, step };
}

const SpanScaleContext = createContext(null);

const lengthOf = (it, now) => (it.startedAt ? (it.running ? now : it.endedAt || now) - it.startedAt : 0);

/**
 * The shared scale for the Spans inside it. `items` are { startedAt, endedAt,
 * running }; while one runs the scale re-checks each second, but its value
 * (and so the Spans) only changes when the rounded maximum does.
 */
export function SpanScale({ items, children }) {
  const visible = usePageVisible();
  const anyRunning = items.some((it) => it.running);
  const now = useTick(anyRunning && visible);
  const timed = items.filter((it) => it.startedAt);
  const maxMs = Math.max(0, ...timed.map((it) => lengthOf(it, now)));
  const { max, step } = spanScale(maxMs);
  const count = timed.length;
  const value = useMemo(() => ({ max, step, count }), [max, step, count]);
  return <SpanScaleContext.Provider value={value}>{children}</SpanScaleContext.Provider>;
}

/** The list's ruler, in full mode and only when two or more Spans share it. */
export function SpanRuler({ className }) {
  const scale = useContext(SpanScaleContext);
  const compact = useFigureCompact();
  if (!scale || compact || scale.count < 2) return null;
  const maxSecs = scale.max / 1000;
  const ticks = Math.round(maxSecs / scale.step);
  return (
    <div className={className} title={`Time scale for the durations below, 0 to ${fmtSecs(maxSecs)}`}>
      <svg
        width={SPAN_WIDTH}
        height={22}
        viewBox={`0 0 ${SPAN_WIDTH} 22`}
        aria-hidden="true"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <Ruler x0={0.5} x1={TRACK} y={19.5} max={maxSecs} step={scale.step} labelEvery={ticks} fmt={(v) => (v === 0 ? (maxSecs >= 60 ? '0m' : '0s') : fmtSecs(v))} up />
      </svg>
    </div>
  );
}

const TONE = { done: INK.fg, live: INK.lamp, fault: INK.fault, muted: INK.muted };

/**
 * One duration. `tone` is done | live | fault | muted; live ticks itself.
 * Outside a SpanScale the line fills the track.
 */
export function Span({ startedAt, endedAt, tone = 'done', format = formatTimer, title }) {
  const scale = useContext(SpanScaleContext);
  const compact = useFigureCompact();
  const visible = usePageVisible();
  const live = tone === 'live';
  const now = useTick(live && visible);
  if (!startedAt) return null;
  const ms = Math.max(0, (live ? now : endedAt || now) - startedAt);
  const max = scale?.max || ms || 1;
  const xe = Math.max(1.5, Math.min(1, ms / max) * TRACK);
  const y = H / 2;
  const ink = TONE[tone] || INK.fg;
  const text = format(ms);
  return (
    <svg
      role="img"
      aria-label={title || text}
      width={SPAN_WIDTH}
      height={H}
      viewBox={`0 0 ${SPAN_WIDTH} ${H}`}
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      {title && <title>{title}</title>}
      <line
        x1={0.5}
        x2={xe}
        y1={y}
        y2={y}
        style={{ stroke: ink, strokeWidth: live ? STROKE.emphasis : STROKE.ink }}
      />
      {!compact && (
        <path
          d={`M0.5 ${y - 3}V${y + 3}${live ? '' : `M${xe} ${y - 3}V${y + 3}`}`}
          style={{ stroke: ink, strokeWidth: STROKE.hair }}
        />
      )}
      {live && !compact && (
        <>
          <line
            x1={xe}
            x2={Math.min(TRACK, xe + TAIL)}
            y1={y}
            y2={y}
            style={{ stroke: INK.lamp, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }}
          />
          <Node x={xe} y={y} state="live" size={5} />
        </>
      )}
      <T x={TRACK + GAP} y={y + 4} color={live ? INK.lamp : INK.muted}>{text}</T>
    </svg>
  );
}
