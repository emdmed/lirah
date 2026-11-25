import { Figure, INK, Node, Ruler, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { fallbackTitle } from './changesPrompt';
import { dayLayout } from './dayLayout';

// FIG.41: one day's changes in lanes on a time ruler. One lane per feature,
// its turn count beside the name; each change a bar from its first turn to
// its last (one turn: a dot), titled on a paper backing. A faint dashed lane
// counts the talk. Each release is a dashed line through every lane, a
// diamond at the foot with the version and time under it. ↵ or a click on a
// change opens it in the week list. Compact or narrow, it lists the day's
// changes by feature.

const NAME_W = 170;
const W = 660;
const X1 = W - 24;
const RULER_Y = 8;
const TOP = 34;
const ROW = 30;
const MIN_W = 480;

const hh = (h) => String(h).padStart(2, '0');
const clock = (at) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const cut = (s, px) => {
  const n = Math.floor(px / 7);
  return s.length > n ? (n > 1 ? `${s.slice(0, n - 1)}…` : '') : s;
};

function DayList({ lanes, title }) {
  return (
    <ul className="flex flex-col gap-1 font-[family-name:var(--font-legend)] text-[11px] text-muted-foreground">
      {lanes.map((l) => (
        <li key={l.id ?? 'none'} className="flex min-w-0 flex-col">
          <span className="truncate text-foreground">{l.name} · {l.turns}</span>
          {l.bars.map((b) => <span key={b.change.id} className="truncate pl-3">{clock(b.change.start)} {title(b.change)}</span>)}
        </li>
      ))}
    </ul>
  );
}

/** `day`'s changes ('YYYY-MM-DD') by feature; `features`, `talk`, `releases`, `titles` as useChanges gives them. */
export function Fig41ChangesDay({ features, talk, releases, titles, day, onOpen }) {
  const compact = useFigureCompact();
  const l = dayLayout(features, talk, releases, day);
  if (!l) return null;
  const title = (c) => titles[c.id] ?? fallbackTitle(c);
  if (compact) return <DayList lanes={l.lanes} title={title} />;

  const X0 = NAME_W;
  const px = (f) => X0 + f * (X1 - X0);
  const yOf = (i) => TOP + i * ROW + ROW / 2;
  const talkY = l.talk ? yOf(l.lanes.length) : null;
  const laneEnd = TOP + (l.lanes.length + (l.talk ? 1 : 0)) * ROW;
  const bottom = laneEnd + (l.releases.length ? 36 : 4);
  const hours = l.ticks.length - 1;

  const label = `Changes on ${day}, ${hh(l.ticks[0].hour)}:00 to ${hh(l.ticks.at(-1).hour)}:00: ${l.lanes.map((ln) => `${ln.name} ${ln.turns} turns, ${ln.bars.map((b) => title(b.change)).join(', ')}`).join('; ')}. ${l.talk} talk turns. Releases: ${l.releases.map((r) => `${r.tag} at ${clock(r.at)}`).join(', ') || 'none'}.`;

  const open = (c) => (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    e.preventDefault();
    onOpen?.(c);
  };

  return (
    <Figure fig="changes-day" viewBox={`0 0 ${W} ${bottom}`} minWidth={MIN_W} label={label} fallback={<DayList lanes={l.lanes} title={title} />}>
      {l.ticks.slice(1, -1).map((t) => (
        <line key={t.x} x1={px(t.x)} x2={px(t.x)} y1={TOP} y2={laneEnd} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
      ))}
      {l.releases.map((r) => (
        <g key={r.tag}>
          <title>{`${r.tag} · ${new Date(r.at).toLocaleString()}`}</title>
          <line x1={px(r.x)} x2={px(r.x)} y1={TOP} y2={laneEnd + 6} style={{ stroke: INK.muted, strokeWidth: STROKE.hair }} strokeDasharray="3 3" />
          <Node x={px(r.x)} y={laneEnd + 6} state="merge" size={6} />
          <T x={px(r.x)} y={laneEnd + 20} anchor="middle" color={INK.fg} halo>{r.tag}</T>
          <T x={px(r.x)} y={laneEnd + 31} anchor="middle" color={INK.faint} halo>{clock(r.at)}</T>
        </g>
      ))}
      <Ruler x0={X0} x1={X1} y={RULER_Y} max={hours} step={1} labelEvery={hours > 12 ? 2 : 1} fmt={(v) => hh(l.ticks[v].hour)} />
      <line x1={0} x2={W} y1={TOP} y2={TOP} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      {l.lanes.map((ln, i) => {
        const y = yOf(i);
        return (
          <g key={ln.id ?? 'none'}>
            <T x={0} y={y + 3.5} color={ln.id == null ? INK.muted : INK.fg}>{cut(ln.name, NAME_W - 40)}</T>
            <T x={X0 - 10} y={y + 3.5} anchor="end" color={INK.muted}>{ln.turns}</T>
            <line x1={X0} x2={X1} y1={y + 5} y2={y + 5} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
            {ln.bars.map((b) => {
              const x0 = px(b.x0);
              const name = cut(title(b.change), b.room * (X1 - X0) - 6);
              return (
                <g
                  key={b.change.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${title(b.change)}, ${b.change.days[day]} turn${b.change.days[day] === 1 ? '' : 's'}, open in the week list`}
                  onClick={open(b.change)}
                  onKeyDown={open(b.change)}
                  className="cursor-pointer outline-none [&:focus-visible_.bar]:stroke-[var(--ins-lamp)]"
                >
                  <title>{`${title(b.change)} · ${clock(b.change.start)}–${clock(b.change.end ?? b.change.start)}`}</title>
                  {b.dot
                    ? <circle className="bar" cx={x0} cy={y + 5} r={3.5} style={{ fill: INK.fg, strokeWidth: 2 }} />
                    : <rect className="bar" x={x0} y={y + 2} width={Math.max(px(b.x1) - x0, 4)} height={6} style={{ fill: INK.fg, strokeWidth: 2 }} />}
                  {name && (
                    <>
                      <rect x={x0 - 2} y={y - 12} width={textWidth(name) + 4} height={12} style={{ fill: INK.paper }} />
                      <T x={x0} y={y - 3} color={INK.fg}>{name}</T>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      {talkY != null && (
        <g>
          <T x={0} y={talkY + 3.5} color={INK.faint}>Talk, no code</T>
          <T x={X0 - 10} y={talkY + 3.5} anchor="end" color={INK.faint}>{l.talk}</T>
          <line x1={X0} x2={X1} y1={talkY + 5} y2={talkY + 5} style={{ stroke: INK.faint, strokeWidth: STROKE.hair }} strokeDasharray="2 3" />
        </g>
      )}
    </Figure>
  );
}
