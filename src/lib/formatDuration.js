// Durations in ms as short text. Three styles, kept apart because each one's
// output is what its screen already shows.

/** Rounded, seconds dropped when zero: 42s, 3m, 3m 12s, 1h 5m. */
export function formatDuration(ms) {
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return secs % 60 ? `${mins}m ${secs % 60}s` : `${mins}m`;
}

/** A ticking timer: floored, seconds always shown under an hour: 42s, 3m 0s, 3m 12s, 1h 5m. */
export function formatTimer(ms) {
  const secs = Math.max(0, Math.floor(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** How long ago, largest unit only, floored: 42s, 3m, 5h, 2d. */
export function formatAgo(ms) {
  const secs = Math.max(0, Math.floor(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
