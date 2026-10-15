import { Profiler } from "react";

const SLOW_COMMIT_MS = 16;

function logSlowCommit(id, phase, actualDuration) {
  if (actualDuration > SLOW_COMMIT_MS) {
    console.debug(`[perf] slow ${phase} commit in ${id}: ${actualDuration.toFixed(1)} ms`);
  }
}

// Dev-only: logs any commit of the wrapped subtree that takes longer than a
// frame. Renders children untouched in production.
export function DevProfiler({ id, children }) {
  if (!import.meta.env.DEV) return children;
  return <Profiler id={id} onRender={logSlowCommit}>{children}</Profiler>;
}
