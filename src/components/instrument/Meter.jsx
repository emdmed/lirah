import { cn } from '@/lib/utils';
import '@/components/instrument/calibrated';
import { clamp01, gaugeLevel, WARN_AT } from './gauge';
import { useFigureCompact } from './figure/Figure';
import './calGauges.css';

// A meter for a quantity with a ceiling, drawn by the calibrated
// <cal-meter>: ticks every 10%, a hatched red zone from the alert line, an
// ink fill and a lamp needle, toned by level (below).
//
// `size="lg"` with figures: full (and `printed` not false) is the printed
// meter: numbered scale, the alert value, and the reading boxed on a
// leader. Everything else is the compact meter: the scale plus "46k/1M"
// beside it, or the scale alone with `readout={false}` (the caller shows its
// own figure; the status bar). `warnAt` is a share of `max`.
//
// Tones as Lirah's gauges: the whole fill and the needle turn amber at
// `warnAt` (or with `caution`) and red at 95% (gaugeLevel), set by
// data-level on the wrapper (calGauges.css recolours the element's fill,
// needle and reading). A custom `format` isn't drawn: cal-meter formats as
// 46k / 1.2M.

const LG_W = 160; // the lg scale's length, in the 140–260px of the old gauge
const SM_W = 72;
const PRINTED_W = 320;
const C_TOP = 4; // the compact drawing's empty top band, trimmed in place
const C_H = 22;

export function formatCompact(n) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${+(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function Meter({ value, max, warnAt = WARN_AT, label, size, readout = true, caution = false, printed, className }) {
  const compact = useFigureCompact();
  const print = size === 'lg' && !compact && (printed ?? true);
  const top = max > 0 ? max : 1;
  const v = Math.min(Math.max(0, value || 0), top);
  const warn = clamp01(warnAt) * top;
  const name = label ? label.toLowerCase() : 'reading';
  const scaleW = size === 'lg' ? LG_W : SM_W;
  const level = gaugeLevel(top > 0 ? clamp01(v / top) : 0, clamp01(warnAt), caution);

  const el = (
    <cal-meter
      key={print ? 'full' : 'compact'}
      value={String(Math.round(v))}
      max={String(top)}
      warn={String(warn)}
      label={name}
      width={String(print ? PRINTED_W : scaleW)}
      style={print ? undefined : { marginTop: -C_TOP }}
    />
  );

  return (
    <span
      className={cn('cal cal-gauge cal-meter-tone', !print && 'cal-gauge-clip', className)}
      data-level={level}
      data-density={print ? 'full' : 'compact'}
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={top}
      // Compact: trim the empty top band; without a readout, clip to the scale.
      style={print ? undefined : { height: C_H, width: readout ? undefined : scaleW + 2 }}
    >
      {el}
    </span>
  );
}
