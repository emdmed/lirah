import { createContext, useContext, useMemo } from 'react';
import { useFigureCompact } from '@/components/instrument/figure';
import '@/components/instrument/calibrated';
import { formatTimer } from '../../lib/formatDuration';
import { useTick } from '../../hooks/useTick';
import { usePageVisible } from '../../hooks/usePageVisible';
import { useCalSvg } from './useCalSvg';

// P6: a duration drawn as a dimension line, by Lirah's calibrated spanRow
// recipe (components/instrument/calibrated/recipes/spanRow.js). When several
// sit in one list they share a time scale (SpanScale) and the list prints
// its ruler once at the top (SpanRuler, the spanRuler recipe on the same
// track), so the lines compare at a glance. `tone` done | live | fault |
// muted inks the line; a running item ends in the lamp star and a dashed
// lamp tail, redrawn at most once a second. Full draws end ticks; compact
// keeps the line and the value. Every Span has the same width, so values
// line up in a column under the ruler. Lines grow in when they first show.

const TRACK = 60;
const GAP = 6;
const VALUE_W = 49; // "12m 40s" in the 7px legend face
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
  const show = scale && !compact && scale.count >= 2;
  const maxSecs = scale ? scale.max / 1000 : 1;
  const fmt = (v) => (v === 0 ? (maxSecs >= 60 ? '0m' : '0s') : fmtSecs(v));
  const ref = useCalSvg('spanRuler', { maxSecs, step: scale?.step ?? 1, track: TRACK, w: SPAN_WIDTH, fmt });
  if (!show) return null;
  return (
    <div className={`cal ${className ?? ''}`} title={`Time scale for the durations below, 0 to ${fmtSecs(maxSecs)}`}>
      <svg ref={ref} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }} />
    </div>
  );
}

/**
 * One duration. `tone` is done | live | fault | muted; live ticks itself.
 * `format` prints the value. Outside a SpanScale the line fills the track.
 */
export function Span({ startedAt, endedAt, tone = 'done', format = formatTimer, title }) {
  const scale = useContext(SpanScaleContext);
  const compact = useFigureCompact();
  const visible = usePageVisible();
  const live = tone === 'live';
  const now = useTick(live && visible);
  const ms = startedAt ? Math.max(0, (live ? now : endedAt || now) - startedAt) : 0;
  const text = format(ms);
  const ref = useCalSvg('spanRow', {
    ms, max: scale?.max || ms || 1, tone, text, compact, track: TRACK, gap: GAP, valueW: VALUE_W, label: title || text,
  });
  if (!startedAt) return null;
  return (
    <span className="cal" style={{ display: 'block', flexShrink: 0 }} title={title}>
      <svg ref={ref} style={{ display: 'block', overflow: 'visible' }} />
    </span>
  );
}
