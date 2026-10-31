import { format } from 'date-fns';
import { CalRecipe } from '@/components/instrument/calibrated';
import { FAULT_AT, WARN_AT, gaugeLevel } from '@/components/instrument/gauge';
import { formatTokenCount } from './tokenCalculations';

// FIG.14: a budget limit as Lirah's budgetToned recipe (the calibrated
// budget recipe plus gauge tones, in components/instrument/calibrated/
// recipes/budgetToned.js). 0 → limit, the zone past the first alert hatched red,
// the 80% line amber and the 95% line red where the toasts fire, the used
// bar in ink, amber past 80% or red past 95%, boxed on a leader, and (daily only) a dashed lamp line
// projecting the day's pace to 24:00, boxed with when it crosses the alert.
// It fills in when first shown: the used bar, then the pace running on, and
// the alert it crosses blinks. Compact shows `fallback`.

const MIN_W = 320;
const MAX_W = 520;
const MIN_HOURS = 1; // before 01:00 the day's rate is noise

const pct = (v) => `${Math.round(v * 100)}%`;
const hhmm = (d) => format(d, 'HH:mm');

const WARN_INK = 'var(--ins-warn)';
const USED_INK = { ok: 'fg', warn: WARN_INK, fault: 'ft' };

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
  if (!(limit > 0)) return fallback;

  const daily = kind === 'daily';
  const ratio = used / limit;
  const pace = daily ? budgetPace({ rows, used, limit, now }) : null;

  const label = [
    `${daily ? 'Daily' : 'Weekly'} budget: ${formatTokenCount(used)} of ${formatTokenCount(limit)} used (${pct(Math.min(ratio, 9.99))})`,
    pace && `at this pace ≈ ${formatTokenCount(Math.round(pace.projected))} by 24:00`,
    pace?.warnTime && `${pct(WARN_AT)} at ≈ ${hhmm(pace.warnTime)}`,
    `alerts at ${pct(WARN_AT)} and ${pct(FAULT_AT)}`,
  ].filter(Boolean).join('; ').concat('.');

  // The ruler ends at the limit: a use or projection past it sits at the end,
  // and its box still says the real number.
  const title = `budget · ${daily ? 'daily · all sessions' : 'weekly'} · ${pct(ratio)}`;
  const data = {
    max: limit,
    step: limit / 20,
    every: 5,
    used: Math.min(used, limit),
    at: daily ? hhmm(now) : undefined,
    usedLabel: daily ? `used · ${hhmm(now)}` : 'used this week',
    fmt: formatTokenCount,
    // Ink below the first alert, amber past it, red past the last: as the gauges.
    usedInk: USED_INK[gaugeLevel(ratio)],
    alerts: [
      { v: WARN_AT * limit, label: `alert ${pct(WARN_AT)}`, ink: WARN_INK },
      { v: FAULT_AT * limit, label: pct(FAULT_AT), ink: 'ft' },
    ],
    label,
  };
  if (used > limit) data.usedLabel = `${data.usedLabel} · ${formatTokenCount(used)}`;
  if (pace && pace.projected > used) {
    data.pace = Math.min(pace.projected, limit);
    data.paceLabel = [
      'at this pace by 24:00',
      [`≈ ${formatTokenCount(Math.round(pace.projected))}`, pace.warnTime && `${pct(WARN_AT)} at ≈ ${hhmm(pace.warnTime)}`].filter(Boolean).join(' · '),
    ];
  }

  return (
    <div className="min-w-0" title={label}>
      <CalRecipe
        recipe="budgetToned"
        title={title}
        data={data}
        replayKey={`${kind}:${limit}`}
        fit={{ min: MIN_W, max: MAX_W }}
        fallback={fallback}
      />
    </div>
  );
}
