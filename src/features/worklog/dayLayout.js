// FIG.41's layout: one day's changes on a time ruler that runs from the
// day's first turn (or release) to its last, rounded out to whole hours.
// Positions are fractions of the ruler (0..1); the figure scales them.

const HOUR = 60 * 60 * 1000;

/**
 * useChanges' features + talk + releases, one 'YYYY-MM-DD' `day` →
 * { from, to, ticks: [{ x, hour }], lanes: [{ id, name, turns, bars: [{ change, x0, x1, dot }] }],
 *   releases: [{ tag, at, x }], talk } or null when nothing ran that day.
 * `dot` marks a change of one turn that day.
 */
export function dayLayout(features, talk, releases, day) {
  const d0 = new Date(`${day}T00:00`);
  const d1 = new Date(d0);
  d1.setDate(d1.getDate() + 1);
  const clip = (t) => Math.min(d1.getTime(), Math.max(d0.getTime(), t));

  const lanes = features
    .map((f) => {
      const changes = f.changes.filter((c) => c.days?.[day]).sort((a, b) => a.start - b.start);
      return { id: f.id, name: f.name, turns: changes.reduce((n, c) => n + c.days[day], 0), changes };
    })
    .filter((l) => l.changes.length);
  const rels = releases.filter((r) => r.at >= d0.getTime() && r.at < d1.getTime());
  const times = [...lanes.flatMap((l) => l.changes.flatMap((c) => [clip(c.start), clip(c.end ?? c.start)])), ...rels.map((r) => r.at)];
  if (!times.length) return null;

  const from = new Date(Math.min(...times));
  from.setMinutes(0, 0, 0);
  const to = new Date(Math.max(...times));
  if (to.getMinutes() || to.getSeconds() || to.getMilliseconds()) to.setHours(to.getHours() + 1, 0, 0, 0);
  if (to <= from) to.setTime(from.getTime() + HOUR);
  const span = to - from;
  const x = (t) => (t - from) / span;

  const ticks = [];
  for (let t = from.getTime(); t <= to.getTime(); t += HOUR) ticks.push({ x: x(t), hour: new Date(t).getHours() });

  return {
    from: from.getTime(),
    to: to.getTime(),
    ticks,
    lanes: lanes.map(({ changes, ...l }) => ({
      ...l,
      bars: changes.map((c) => ({ change: c, x0: x(clip(c.start)), x1: x(clip(c.end ?? c.start)), dot: c.days[day] === 1 })),
    })),
    releases: rels.map((r) => ({ ...r, x: x(r.at) })),
    talk: talk[day] ?? 0,
  };
}
