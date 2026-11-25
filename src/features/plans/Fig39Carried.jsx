import { DASH, Figure, Glow, INK, Node, STROKE, T, useFigureCompact } from '@/components/instrument/figure';
import { CHUNK_STATUS } from './planModel';
import { decisionLinks, hasBuildsOn } from './decisionLinks';

// FIG.39: which decisions later chunks carried. Chunks hang on a spine; each
// numbered decision is a ring on its chunk's row, with a curved leader down to
// every later chunk whose Builds on: line named it, an ok ring around that
// chunk's node. A decision nothing built on is a hollow dashed ring, glowing
// when it's the only one. Compact or narrow, it lists the ones nothing built on.
// Renders nothing for plans from before Builds on: lines.

const W = 520;
const ROW = 22;
const TOP = 8;
const SPINE = 26;
const DEC0 = 52;
const DSTEP = 40;
const R = 4.5;
const MIN_W = 360;

function Unbuilt({ list }) {
  if (!list.length) return <div className="text-[11px] text-muted-foreground">every decision was built on</div>;
  return (
    <ul className="flex flex-col gap-0.5 font-[family-name:var(--font-legend)] text-[11px] text-muted-foreground">
      {list.map((d) => (
        <li key={d.id} className="flex min-w-0 gap-2" title={d.text}>
          <span className="shrink-0 tabular-nums">{d.id}</span>
          <span className="min-w-0 truncate text-foreground">{d.text}</span>
          <span className="shrink-0 tabular-nums">chunk {d.chunk}</span>
        </li>
      ))}
    </ul>
  );
}

/** Decisions and the later chunks that built on them. */
export function Fig39Carried({ plan }) {
  const compact = useFigureCompact();
  if (!hasBuildsOn(plan)) return null;
  const { decisions, links } = decisionLinks(plan);
  if (!decisions.length) return null;
  const unbuilt = decisions.filter((d) => !links.some((l) => l.from === d.id));
  if (compact) return <Unbuilt list={unbuilt} />;

  const chunks = plan.chunks;
  const rowOf = new Map(chunks.map((c, i) => [c.n, i]));
  const yOf = (n) => TOP + rowOf.get(n) * ROW + ROW / 2;
  const xOf = new Map();
  for (const c of chunks) decisions.filter((d) => d.chunk === c.n).forEach((d, j) => xOf.set(d.id, DEC0 + j * DSTEP));
  const titleX = Math.max(DEC0, ...xOf.values()) + DSTEP;
  const maxChars = Math.floor((W - 4 - titleX) / 7);
  const targets = new Set(links.map((l) => l.to));
  const bottom = TOP + chunks.length * ROW;
  const lone = unbuilt.length === 1 ? unbuilt[0] : null;
  const label = `Decisions carried: ${decisions.map((d) => {
    const to = links.filter((l) => l.from === d.id).map((l) => l.to);
    return `${d.id} from chunk ${d.chunk} ${to.length ? `built on by chunk ${to.join(', ')}` : 'built on by nothing'}`;
  }).join('; ')}.`;

  return (
    <Figure fig="carried" viewBox={`0 0 ${W} ${bottom + 22}`} minWidth={MIN_W} label={label} fallback={<Unbuilt list={unbuilt} />}>
      <line x1={SPINE} x2={SPINE} y1={yOf(chunks[0].n)} y2={yOf(chunks.at(-1).n)} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      {/* Leaders first, so rings and nodes sit on top of them. */}
      {links.map((l) => {
        const d = decisions.find((x) => x.id === l.from);
        const x = xOf.get(d.id);
        const y0 = yOf(d.chunk) + R;
        const y1 = yOf(l.to);
        return (
          <path
            key={`${l.from}-${l.to}`}
            d={`M${x} ${y0} C${x} ${(y0 + y1) / 2} ${SPINE + 24} ${y1} ${SPINE + 8} ${y1}`}
            style={{ fill: 'none', stroke: INK.fg, strokeWidth: 0.6, strokeOpacity: 0.6 }}
          />
        );
      })}
      {chunks.map((c) => {
        const y = yOf(c.n);
        return (
          <g key={c.id ?? c.n}>
            <T x={SPINE - 10} y={y + 3.5} anchor="end" color={INK.muted}>{c.n}</T>
            <Node x={SPINE} y={y} state={c.status === CHUNK_STATUS.IMPLEMENTED ? 'done' : 'todo'} size={6} />
            {targets.has(c.n) && <circle cx={SPINE} cy={y} r={6.5} style={{ fill: 'none', stroke: INK.ok, strokeWidth: STROKE.ink }} />}
            <T x={titleX} y={y + 3.5} color={INK.faint}>{c.title?.length > maxChars ? `${c.title.slice(0, maxChars - 1)}…` : c.title}</T>
          </g>
        );
      })}
      {decisions.map((d) => {
        const x = xOf.get(d.id);
        const y = yOf(d.chunk);
        const built = !unbuilt.includes(d);
        const ring = built
          ? <circle cx={x} cy={y} r={R} style={{ fill: INK.paper, stroke: INK.fg, strokeWidth: STROKE.ink }} />
          : <circle cx={x} cy={y} r={R} strokeDasharray={DASH.fine} style={{ fill: INK.paper, stroke: INK.muted, strokeWidth: STROKE.hair }} />;
        return (
          <g key={d.id}>
            <title>{`${d.id}: ${d.text}`}</title>
            {d === lone ? <Glow>{ring}</Glow> : ring}
            <T x={x + R + 3} y={y + 3.5} color={built ? INK.fg : INK.muted}>{d.id}</T>
          </g>
        );
      })}
      <line x1={DEC0 - R} x2={W - 4} y1={bottom + 4} y2={bottom + 4} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
      <T x={DEC0 - R} y={bottom + 18} color={INK.muted}>{`${decisions.length} decisions · ${decisions.length - unbuilt.length} built on · ${unbuilt.length} not`}</T>
    </Figure>
  );
}
