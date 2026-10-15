// Dev-only performance probes. Every export is a no-op in production builds
// (import.meta.env.DEV is statically false there, so the bodies tree-shake).
const enabled = import.meta.env.DEV;

export function perfMark(name) {
  if (enabled) performance.mark(name);
}

// Measures from a mark to now; logs and returns the duration in ms.
export function perfMeasure(name, startMark) {
  if (!enabled) return 0;
  try {
    const { duration } = performance.measure(name, startMark);
    console.debug(`[perf] ${name}: ${duration.toFixed(1)} ms`);
    return duration;
  } catch {
    return 0; // start mark missing
  }
}

let startupLogged = false;

// Cold start → first terminal output, logged once per page load. Reported
// from navigation start (performance.now()'s origin) and from app:start,
// which main.jsx marks once all modules have been evaluated.
export function perfFirstOutput() {
  if (!enabled || startupLogged) return;
  startupLogged = true;
  console.debug(`[perf] startup:first-terminal-output: ${performance.now().toFixed(1)} ms since navigation`);
  perfMeasure('startup:first-terminal-output (from app:start)', 'app:start');
}

// Keystroke → echo latency: the time from xterm's onData to the write
// callback of the next output chunk (i.e. the echo is on screen). Samples are
// approximate — any output after a keystroke counts as its echo.
const ECHO_REPORT_EVERY = 200;
let pendingInputAt = null;
const echoSamples = [];

export function perfInput() {
  if (enabled && pendingInputAt === null) pendingInputAt = performance.now();
}

export function perfOutputWritten() {
  if (!enabled || pendingInputAt === null) return;
  echoSamples.push(performance.now() - pendingInputAt);
  pendingInputAt = null;
  if (echoSamples.length >= ECHO_REPORT_EVERY) {
    const sorted = echoSamples.splice(0).sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(1);
    console.debug(`[perf] keystroke→echo over ${sorted.length}: p50 ${at(0.5)} ms, p95 ${at(0.95)} ms`);
  }
}
