import { format } from 'date-fns';
import { Box, DASH, Figure, Hatch, INK, Leader, Node, Ruler, STROKE, T, useFigureScale } from '@/components/instrument/figure';
import { FAULT_AT, WARN_AT, gaugeLevel } from '@/components/instrument/gauge';
import { formatTokenCount } from './tokenCalculations';

// FIG.14: a budget limit as a measured ruler. 0 → limit, the alert band
// hatched from WARN_AT to the end with lines where the toasts fire, the used
// bar ending in a node, and (daily only) a dashed lamp line projecting the
// day's pace to 24:00.

const W = 380;
const X0 = 0;
const X1 = 340; // room past the limit for the end label and an overshooting pace
const RULER_Y = 62;
const BOX_Y = RULER_Y + 32;
const USED_W = 112;
const GAP = 8;
const PACE_X = USED_W + GAP;
const PACE_W = W - PACE_X;
const WARN = 'var(--ins-warn)';
const TONE = { ok: INK.lamp, warn: WARN, fault: INK.fault };
const MIN_HOURS = 1; // before 01:00 the day's rate is noise

const pct = (v) => `${Math.round(v * 100)}%`;
const hhmm = (d) => format(d, 'HH:mm');

/**
 * Today's pace for the daily ruler, or null when there is none to draw:
 * before 01:00 local, or no daily_activity row for today. The rate is today's
 * billable in+out across all sessions per hour since local midnight; the
 * projection starts from `used` and runs that rate to 24:00. `warnTime` is
 * when the projection crosses WARN_AT of the limit, if it does before 24:00
 * and `used` is still below it.
 */
export function budgetPace({ rows, used, limit, now = new Date() }) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const hours = (now - midnight) / 3_600_000;
  if (hours < MIN_HOURS || !(limit > 0)) return null;

  const today = format(now, 'yyyy-MM-dd');
  const todays = (rows || []).filter((r) => r.date === today);
  if (!todays.length) return null;
  const tokens = todays.reduce((n, r) => n + (r.billable_input_tokens || 0) + (r.billable_output_tokens || 0), 0);

  const rate = tokens / hours;
  const left = Math.max(0, 24 - hours);
  const projected = used + rate * left;

  const warnTokens = WARN_AT * limit;
  let warnTime = null;
  if (rate > 0 && used < warnTokens) {
    const h = (warnTokens - used) / rate;
    if (h <= left) warnTime = new Date(now.getTime() + h * 3_600_000);
  }
  return { rate, projected, warnTime };
}

/**
 * `kind` is 'daily' or 'weekly'; `used` is the number the alerts read
 * (currentUsage.total); `rows` is projectStats.daily_activity, used only for
 * the daily pace.
 */
export function Fig14Budget({ kind, limit, used, rows, fallback, now = new Date() }) {
  const scale = useFigureScale(limit, X0, X1);
  if (!(limit > 0)) return fallback;

  const daily = kind === 'daily';
  const ratio = used / limit;
  const tone = TONE[gaugeLevel(ratio)];
  const pace = daily ? budgetPace({ rows, used, limit, now }) : null;
  const H = pace ? BOX_Y + 50 : BOX_Y + 36;

  const usedX = scale(used);
  const barY = RULER_Y - 4;
  // The projection may run past the limit; let it into the margin, no further.
  const paceX = pace ? Math.min(X0 + (pace.projected / limit) * (X1 - X0), W - 4) : null;
  const warnX = scale(WARN_AT * limit);
  const faultX = scale(FAULT_AT * limit);

  const title = `BUDGET · ${daily ? 'DAILY' : 'WEEKLY'}`;
  const label = [
    `${daily ? 'Daily' : 'Weekly'} budget: ${formatTokenCount(used)} of ${formatTokenCount(limit)} used (${pct(Math.min(ratio, 9.99))})`,
    pace && `at this pace ≈ ${formatTokenCount(Math.round(pace.projected))} by 24:00`,
    pace?.warnTime && `${pct(WARN_AT)} at ≈ ${hhmm(pace.warnTime)}`,
  ].filter(Boolean).join('; ');

  const paceValue = pace && [
    `≈ ${formatTokenCount(Math.round(pace.projected))}`,
    pace.warnTime && `${pct(WARN_AT)} at ≈ ${hhmm(pace.warnTime)}`,
  ].filter(Boolean).join(' · ');

  return (
    <Figure fig="budget" title={title} viewBox={`0 0 ${W} ${H}`} minWidth={320} fallback={fallback} label={label}>
      {/* Readout: used / limit, and the share. */}
      <T x={X0} y={30}>
        <tspan style={{ fill: tone }}>{formatTokenCount(used)}</tspan>
        <tspan style={{ fill: INK.faint }}>{` / ${formatTokenCount(limit)}`}</tspan>
      </T>
      <T x={W} y={30} anchor="end" color={tone}>{pct(ratio)}</T>

      {/* The alert band and the lines where the toasts fire. */}
      <Hatch x={warnX} y={RULER_Y - 10} width={X1 - warnX} height={10} stroke={null} />
      <line x1={warnX} x2={warnX} y1={RULER_Y - 20} y2={RULER_Y} style={{ stroke: WARN, strokeWidth: STROKE.hair }} />
      <line x1={faultX} x2={faultX} y1={RULER_Y - 20} y2={RULER_Y} style={{ stroke: INK.fault, strokeWidth: STROKE.hair }} />
      <T x={warnX - 3} y={RULER_Y - 13} anchor="end" color={WARN}>{daily ? `alert ${pct(WARN_AT)}` : pct(WARN_AT)}</T>
      <T x={faultX + 3} y={RULER_Y - 13} color={INK.fault}>{pct(FAULT_AT)}</T>

      {/* Used: a bar from 0, ending in a node. */}
      <rect x={X0} y={RULER_Y - 7} width={Math.max(usedX - X0, 1)} height={6} style={{ fill: tone }} />
      <Ruler x0={X0} x1={X1} y={RULER_Y} max={limit} step={limit / 15} labelEvery={5} fmt={formatTokenCount} />

      {/* Pace: dashed lamp line from used to the 24:00 projection. */}
      {pace && paceX > usedX && (
        <path
          d={`M${usedX} ${barY}H${paceX}`}
          style={{ fill: 'none', stroke: INK.lamp, strokeWidth: STROKE.ink, strokeDasharray: DASH.medium }}
        />
      )}
      {pace && <circle cx={paceX} cy={barY} r={3} style={{ fill: INK.paper, stroke: INK.lamp, strokeWidth: STROKE.ink }} />}
      <Node x={usedX} y={barY} state="done" size={6} />

      {/* Boxes: used on the left, pace on the right. */}
      <Leader points={[[usedX, RULER_Y + 7], [usedX, RULER_Y + 22], [USED_W / 2, RULER_Y + 22], [USED_W / 2, BOX_Y]]} dot={false} />
      <Box x={0} y={BOX_Y} width={USED_W} label={`USED · ${hhmm(now)}`} value={formatTokenCount(used)} valueColor={tone} />
      {pace && (
        <>
          <Leader points={[[paceX, RULER_Y + 7], [paceX, RULER_Y + 26], [PACE_X + PACE_W / 2, RULER_Y + 26], [PACE_X + PACE_W / 2, BOX_Y]]} dot={false} />
          <Box x={PACE_X} y={BOX_Y} width={PACE_W} label="AT THIS PACE BY 24:00" value={paceValue} valueColor={INK.lamp} />
          <T x={W} y={BOX_Y + 46} anchor="end" color={INK.faint}>today, all sessions</T>
        </>
      )}
    </Figure>
  );
}
