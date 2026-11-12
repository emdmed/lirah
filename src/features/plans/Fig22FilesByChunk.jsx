import { CalRecipe } from '@/components/instrument/calibrated';
import { CHUNK_STATUS } from './planModel';
import { basename, pathSegments } from '../../utils/pathUtils';

// FIG.22: which chunks touched which files, as the calibrated matrix recipe.
// Chunks run down, files across (busiest first, up to MAX_COLS), a filled
// square where a chunk's commits touched the file. The busiest file, if three
// or more chunks edit it, is called out in lamp with the chunks to review
// together. Files past MAX_COLS are counted in the tooltip. Narrow or compact,
// it shows the busiest files as text.

const MAX_COLS = 9; // keeps the recipe at its 470-unit floor
const MIN_W = 423; // the kit never draws a recipe below 90% of its 470 width; narrower, the text list
const LABEL_CHARS = 15; // rotated header labels clip past this
const BUSY_AT = 3;

const baseName = (p) => basename(p);
const parentName = (p) => {
  const parts = pathSegments(p);
  return parts.length > 1 ? parts[parts.length - 2] : '';
};
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The grid's data, pure. `byRepo` is usePlanCommitFiles' { [chunkId]: { [root]: paths } }.
 * Returns { rows: [{ id, n }], cols: [{ root, path, label, hits: Set<chunkId>, nums }], more, busiest }.
 */
export function filesByChunk(plan, byRepo) {
  const rows = plan.chunks
    .filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED && byRepo[c.id])
    .map((c) => ({ id: c.id, n: c.n }));
  const byKey = new Map();
  for (const row of rows) {
    for (const [root, paths] of Object.entries(byRepo[row.id])) {
      for (const path of paths) {
        const key = `${root}\0${path}`;
        let col = byKey.get(key);
        if (!col) byKey.set(key, (col = { root, path, hits: new Set(), nums: [] }));
        col.hits.add(row.id);
        col.nums.push(row.n);
      }
    }
  }
  const all = [...byKey.values()].sort(
    (a, b) => b.hits.size - a.hits.size || a.path.localeCompare(b.path) || a.root.localeCompare(b.root)
  );
  const cols = all.slice(0, MAX_COLS);

  // Name each column by its basename; where two shown columns share one, add
  // the repo (if they're in different repos) or the parent folder.
  const seen = new Map();
  for (const c of cols) seen.set(baseName(c.path), [...(seen.get(baseName(c.path)) ?? []), c]);
  for (const c of cols) {
    const base = baseName(c.path);
    const twins = seen.get(base);
    if (twins.length < 2) c.label = base;
    else if (twins.some((t) => t.root !== c.root)) c.label = `${baseName(c.root)}/${base}`;
    else c.label = parentName(c.path) ? `${parentName(c.path)}/${base}` : base;
  }

  const busiest = cols[0] && cols[0].hits.size >= BUSY_AT ? 0 : -1;
  return { rows, cols, more: all.length - cols.length, busiest };
}

// Narrow hosts: the busiest files as text, each with its chunks.
function FileList({ grid }) {
  return (
    <ul className="flex flex-col gap-0.5 font-[family-name:var(--font-legend)] text-[11px] text-muted-foreground">
      {grid.cols.map((c) => (
        <li key={`${c.root}\0${c.path}`} className="flex min-w-0 gap-2" title={c.path}>
          <span className="min-w-0 truncate text-foreground">{c.label}</span>
          <span className="shrink-0 tabular-nums">{[...c.nums].sort((a, b) => a - b).join(' ')}</span>
        </li>
      ))}
      {grid.more > 0 && <li>+{grid.more} files</li>}
    </ul>
  );
}

/** The plan's chunk × file grid. `files` is usePlanCommitFiles(plan, true). */
export function Fig22FilesByChunk({ plan, files }) {
  const note = (text) => <div className="text-[11px] text-muted-foreground">{text}</div>;
  if (files.loading && !Object.keys(files.byRepo).length) return note('reading commits…');
  const grid = filesByChunk(plan, files.byRepo);
  if (!grid.rows.length || !grid.cols.length) return note('no chunk commits yet');
  const busy = grid.busiest >= 0 ? grid.cols[grid.busiest] : null;
  const busyNums = busy ? [...busy.nums].sort((a, b) => a - b) : [];
  const label = `Files by chunk, ${grid.rows.length} chunks down, the ${grid.cols.length} busiest files across: ${grid.cols
    .map((c) => `${c.label} (${[...c.nums].sort((a, b) => a - b).join(', ')})`)
    .join(', ')}${grid.more > 0 ? `, and ${grid.more} more files not drawn` : ''}.${busy
    ? ` ${busy.nums.length} chunks edit ${busy.label}; review them together.` : ''}`;

  const title = `files by chunk · ${grid.rows.length} chunks${grid.more > 0 ? ` · +${grid.more} files` : ''}`;
  const data = {
    cols: grid.cols.map((c) => clip(c.label, LABEL_CHARS)),
    rows: grid.rows.map((r) => String(r.n)),
    hits: grid.rows.map((r) => grid.cols.flatMap((c, i) => (c.hits.has(r.id) ? [i] : []))),
    callout: busy ? { col: grid.busiest, l1: `${busy.nums.length} chunks edit this file`, l2: `review ${busyNums.join(', ')} together` } : undefined,
    label,
  };

  return (
    <div className="min-w-0" title={label}>
      <CalRecipe recipe="matrix" title={title} data={data} minWidth={MIN_W} fallback={<FileList grid={grid} />} />
    </div>
  );
}
