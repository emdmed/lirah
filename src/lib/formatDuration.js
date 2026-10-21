/** 42s, 3m, 3m 12s, 1h 5m. */
export function formatDuration(ms) {
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return secs % 60 ? `${mins}m ${secs % 60}s` : `${mins}m`;
}
