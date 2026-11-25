// FIG.40's cells: turns per feature per day of a range, plus the day totals
// (talk included) for the 'all turns' row.

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The local 'YYYY-MM-DD' of a ms time. */
export const dayKey = (at) => ymd(new Date(at));

/** The 'YYYY-MM-DD' days from `from` to `to`, both in. */
export function rangeDays({ from, to }) {
  const days = [];
  for (const d = new Date(`${from}T00:00`); ymd(d) <= to; d.setDate(d.getDate() + 1)) days.push(ymd(d));
  return days;
}

/**
 * useChanges' features + talk → { days, rows: [{ id, name, cells, added, removed }], total, max },
 * cells and total one turn count per day; max the biggest feature cell.
 */
export function weekGrid(features, talk, range) {
  const days = rangeDays(range);
  const rows = features.map((f) => ({
    id: f.id,
    name: f.name,
    added: f.added,
    removed: f.removed,
    cells: days.map((d) => f.changes.reduce((n, c) => n + (c.days?.[d] ?? 0), 0)),
  }));
  const total = days.map((d, i) => rows.reduce((n, r) => n + r.cells[i], talk[d] ?? 0));
  return { days, rows, total, max: Math.max(0, ...rows.flatMap((r) => r.cells)) };
}
