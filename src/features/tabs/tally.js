// The pane's closing line: every tab in exactly one bucket, first match wins.
// A resting tab whose auto-pilot run failed counts as stopped; a blocked one needs you.
const BUCKETS = [
  { label: 'run stopped', className: 'text-[var(--ins-fault)]', has: (k) => k === 'failed' },
  { label: 'needs you', className: 'text-[var(--ins-warn)]', has: (k) => k === 'permission' },
  { label: 'your turn', className: 'text-[var(--ins-ok)]', has: (k) => k === 'done' },
  { label: 'working', className: 'text-[var(--ins-lamp)]', has: (k) => k === 'working' || k === 'running' || k === 'remote' },
  { label: 'idle', className: 'text-muted-foreground', has: () => true },
];

export function tally(kinds) {
  const counts = BUCKETS.map(() => 0);
  for (const k of kinds) counts[BUCKETS.findIndex((b) => b.has(k))]++;
  return BUCKETS.map(({ label, className }, i) => ({ n: counts[i], label, className })).filter((t) => t.n > 0);
}
