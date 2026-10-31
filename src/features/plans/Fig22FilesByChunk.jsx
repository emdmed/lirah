import { Box, Figure, INK, Leader, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { CHUNK_STATUS } from './planModel';

// FIG.22: which chunks touched which files. Chunks run down, files across
// (busiest first), a filled square where a chunk's commits touched the file.
// The busiest file, if three or more chunks edit it, gets a lamp frame and a
// note naming the chunks to review together. Compact is the grid alone on a
// finer pitch, the busiest column still framed; names move to the tooltip.

const MAX_COLS = 9;
const PITCH = 14; // cell pitch, both ways
const CELL = 9;
const LABEL_CHARS = 15; // rotated header labels clip past this
const ANGLE = 50;
const SIN = Math.sin((ANGLE * Math.PI) / 180);
const COS = Math.cos((ANGLE * Math.PI) / 180);
const TOP = 26; // under the FIG label, clear of its text
const BUSY_AT = 3;
const C_PITCH = 8;
const C_CELL = 5;

const baseName = (p) => p.slice(p.lastIndexOf('/') + 1);
const parentName = (p) => {
  const parts = p.split('/');
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

/** The drawing, pure so it can be rendered headless. Returns { width, height, drawing }. */
export function fig22Layout(grid, compact = false) {
  if (compact) return fig22Compact(grid);
  const { rows, cols, more, busiest } = grid;
  const labels = cols.map((c) => clip(c.label, LABEL_CHARS));
  const headerH = Math.ceil(Math.max(0, ...labels.map((l) => textWidth(l))) * SIN) + 6;
  const rowLabelW = textWidth(String(Math.max(0, ...rows.map((r) => r.n)))) + 10;
  const gx = rowLabelW;
  const gy = TOP + headerH + 4;
  const gridR = gx + cols.length * PITCH;
  const gridB = gy + rows.length * PITCH;
  const cx = (i) => gx + i * PITCH + PITCH / 2;
  const cy = (j) => gy + j * PITCH + PITCH / 2;

  // Rotated labels lean right past the grid; so does the "+k files" note.
  const lean = Math.max(gridR, ...labels.map((l, i) => cx(i) + textWidth(l) * COS + 4));
  const moreText = more > 0 ? `+${more} files` : null;
  let width = Math.max(lean, moreText ? gridR + 8 + textWidth(moreText) + 4 : 0, textWidth('FIG.22  FILES BY CHUNK') + 8);

  let note = null;
  let height = gridB + 4;
  if (busiest >= 0) {
    const col = cols[busiest];
    const nums = [...col.nums].sort((a, b) => a - b);
    const label = `${nums.length} chunks edit this file`;
    const value = `review ${nums.join(', ')} together`;
    const boxW = Math.max(textWidth(label), textWidth(value)) + 14;
    width = Math.max(width, boxW);
    const x = cx(busiest);
    const boxX = Math.max(0, Math.min(x - 12, width - boxW));
    const boxY = gridB + 16;
    note = { x, boxX, boxY, boxW, label, value };
    height = boxY + 32 + 2;
  }
  width = Math.ceil(width);

  const drawing = (
    <g>
      {/* Hairline grid: a guide per column and row, so a square reads by coordinate. */}
      {cols.map((c, i) => (
        <line
          key={`v${i}`}
          x1={cx(i)}
          x2={cx(i)}
          y1={gy}
          y2={gridB}
          style={{ stroke: INK.edge, strokeWidth: STROKE.hair }}
        />
      ))}
      {rows.map((r, j) => (
        <g key={r.id}>
          <line x1={gx} x2={gridR} y1={cy(j)} y2={cy(j)} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
          <T x={gx - 6} y={cy(j) + 3.5} anchor="end" color={INK.faint}>{r.n}</T>
        </g>
      ))}

      {cols.map((c, i) => (
        <g key={`h${i}`} transform={`translate(${cx(i) - 2} ${gy - 5}) rotate(-${ANGLE})`}>
          <title>{c.root ? `${baseName(c.root)}/${c.path}` : c.path}</title>
          <T x={0} y={0} color={i === busiest ? INK.lamp : INK.muted}>{labels[i]}</T>
        </g>
      ))}

      {rows.map((r, j) =>
        cols.map((c, i) =>
          c.hits.has(r.id) ? (
            <rect
              key={`${r.id}-${i}`}
              x={cx(i) - CELL / 2}
              y={cy(j) - CELL / 2}
              width={CELL}
              height={CELL}
              style={{ fill: INK.fg }}
            />
          ) : null
        )
      )}

      {moreText && <T x={gridR + 8} y={cy(0) + 3.5} color={INK.faint}>{moreText}</T>}

      {note && (
        <g>
          <rect
            x={note.x - PITCH / 2 + 1}
            y={gy - 1}
            width={PITCH - 2}
            height={gridB - gy + 2}
            style={{ fill: 'none', stroke: INK.lamp, strokeWidth: STROKE.ink }}
          />
          <Leader points={[[note.x, gridB + 1], [note.x, note.boxY]]} color={INK.lamp} />
          <Box x={note.boxX} y={note.boxY} width={note.boxW} label={note.label} value={note.value} stroke={INK.lamp} />
        </g>
      )}
    </g>
  );
  return { width, height, drawing };
}

// Compact: the hairline grid and its squares on a finer pitch, no labels.
function fig22Compact({ rows, cols, busiest }) {
  const P = C_PITCH;
  const gx = 1;
  const gy = 1;
  const gridR = gx + cols.length * P;
  const gridB = gy + rows.length * P;
  const cx = (i) => gx + i * P + P / 2;
  const cy = (j) => gy + j * P + P / 2;
  const drawing = (
    <g>
      {cols.map((c, i) => (
        <line key={`v${i}`} x1={cx(i)} x2={cx(i)} y1={gy} y2={gridB} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
      ))}
      {rows.map((r, j) => (
        <line key={r.id} x1={gx} x2={gridR} y1={cy(j)} y2={cy(j)} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
      ))}
      {rows.map((r, j) => cols.map((c, i) => (c.hits.has(r.id) ? (
        <rect key={`${r.id}-${i}`} x={cx(i) - C_CELL / 2} y={cy(j) - C_CELL / 2} width={C_CELL} height={C_CELL} style={{ fill: INK.fg }} />
      ) : null)))}
      {busiest >= 0 && (
        <rect
          x={cx(busiest) - P / 2 + 0.5}
          y={gy - 1}
          width={P - 1}
          height={gridB - gy + 2}
          style={{ fill: 'none', stroke: INK.lamp, strokeWidth: STROKE.ink }}
        />
      )}
    </g>
  );
  return { width: Math.ceil(gridR + 1), height: Math.ceil(gridB + 2), drawing };
}

// Narrow hosts: the busiest files as text, each with its chunks.
function FileList({ grid }) {
  return (
    <ul className="flex flex-col gap-0.5 font-[family-name:var(--font-legend)] text-[10px] text-muted-foreground">
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
  const compact = useFigureCompact();
  const note = (text) => <div className="text-[10px] text-muted-foreground">{text}</div>;
  if (files.loading && !Object.keys(files.byRepo).length) return note('reading commits…');
  const grid = filesByChunk(plan, files.byRepo);
  if (!grid.rows.length || !grid.cols.length) return note('no chunk commits yet');
  const { width, height, drawing } = fig22Layout(grid, compact);
  const busy = grid.busiest >= 0 ? grid.cols[grid.busiest] : null;
  const label = `Files by chunk, ${grid.rows.length} chunks down, the ${grid.cols.length} busiest files across: ${grid.cols
    .map((c) => `${c.label} (${[...c.nums].sort((a, b) => a - b).join(', ')})`)
    .join(', ')}${grid.more > 0 ? `, and ${grid.more} more files` : ''}.${busy
    ? ` ${busy.nums.length} chunks edit ${busy.label}; review them together.` : ''}`;
  return (
    <Figure
      fig="files-by-chunk"
      viewBox={`0 0 ${width} ${height}`}
      compactViewBox={`0 0 ${width} ${height}`}
      paper="var(--ins-panel)"
      label={label}
      fallback={<FileList grid={grid} />}
    >
      {drawing}
    </Figure>
  );
}
