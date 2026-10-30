// Shared by the gauges (Meter, ContextMoon): a fill reads warn from `warnAt`
// and fault from FAULT_AT. `caution` forces warn below `warnAt`; fault still wins.
// The token budget alerts use the same two thresholds.
export const WARN_AT = 0.8;
export const FAULT_AT = 0.95;

export const clamp01 = (n) => Math.min(Math.max(n, 0), 1);

export function gaugeLevel(ratio, warnAt = WARN_AT, caution = false) {
  if (ratio >= FAULT_AT) return 'fault';
  return ratio >= warnAt || caution ? 'warn' : 'ok';
}
