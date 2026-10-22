// Shared by the gauges (Meter, ContextMoon): a fill reads warn from `warnAt`
// and fault from FAULT_AT. `caution` forces warn below `warnAt`; fault still wins.
export const FAULT_AT = 0.95;

export const clamp01 = (n) => Math.min(Math.max(n, 0), 1);

export function gaugeLevel(ratio, warnAt = 0.8, caution = false) {
  if (ratio >= FAULT_AT) return 'fault';
  return ratio >= warnAt || caution ? 'warn' : 'ok';
}
