import { useLayoutEffect, useRef, useState } from 'react';
import { DASH, INK, STROKE, T } from '@/components/instrument/figure';
import { cn } from '../../lib/utils';
import { formatAgo } from '../../lib/formatDuration';
import { CHUNK_STATUS, PLAN_STAGE, planLifecycle, planProgress, planStage, shortDate, UNTITLED_PLAN } from './planModel';

// FIG.37: every plan of the repo as a Gantt on one calendar, drawn in drafting
// line types, one per stage: planned is dashed (nothing built yet), building a
// heavy line, waiting to merge a hairline, and a merged plan ends in a filled
// body. A PR is a diamond on the hairline. A plan with a chunk running now
// ends in the gold sun; an open one that isn't running ends in an open ring at
// now. Shelved plans are drawn muted and stop at the last stage they reached
// (shelving isn't dated); one shelved after its merge is merged. Day meridians
// and the now line run through every lane, so the lanes read as one drawing.
// Rows are HTML (names in the name face, focusable, Enter opens the plan); only
// the lanes and the calendar are SVG, all at one measured width.

const DAY = 86_400_000;
const ROW_H = 44;
const LANE_Y = 22;

/** One plan's lane, pure: stage segments and the end mark, in ms. */
export function lifecycleRow(plan, now = Date.now()) {
  const stops = planLifecycle(plan);
  const at = Object.fromEntries(stops.map((s) => [s.stage, s.at]));
  const stage = planStage(plan);
  const merged = stage === PLAN_STAGE.MERGED;
  const shelved = !!plan.shelved && !merged;
  const live = !merged && !shelved && plan.chunks.some((c) => c.status === CHUNK_STATUS.IN_PROGRESS);
  const last = stops[stops.length - 1].at;
  const end = merged || shelved ? last : now;
  const start = at[PLAN_STAGE.PLANNED];
  const built = at[PLAN_STAGE.BUILDING];
  const implemented = at[PLAN_STAGE.IMPLEMENTED];
  const segments = [
    { kind: 'planned', from: start, to: built ?? end },
    built != null && { kind: 'building', from: built, to: implemented ?? end },
    implemented != null && { kind: 'waiting', from: implemented, to: at[PLAN_STAGE.MERGED] ?? end },
  ].filter((s) => s && s.to >= s.from);
  const { done, total } = planProgress(plan);
  const commits = plan.chunks.reduce((n, c) => n + (c.commits?.length ?? 0), 0);
  const chunk = plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS);
  const outcome = merged ? { name: 'merged', note: shortDate(at[PLAN_STAGE.MERGED]) }
    : shelved ? { name: 'shelved', note: `${stage} ${shortDate(last)}` }
      : stage === PLAN_STAGE.PR_OPEN ? { name: `PR #${plan.pr?.number ?? ''}`, note: 'awaiting merge' }
        : stage === PLAN_STAGE.IMPLEMENTED ? { name: 'implemented', note: 'awaiting merge' }
          : stage === PLAN_STAGE.BUILDING ? { name: 'building', note: chunk ? `chunk ${chunk.n}` : 'between chunks' }
            : { name: 'planned', note: 'not started' };
  return {
    id: plan.id,
    title: plan.title || UNTITLED_PLAN,
    start,
    end,
    segments,
    pr: at[PLAN_STAGE.PR_OPEN] ?? null,
    endMark: merged ? 'done' : shelved ? 'stopped' : live ? 'live' : 'open',
    shelved,
    note: [total ? `${done}/${total} chunks` : 'no chunks yet', `${commits} ${commits === 1 ? 'commit' : 'commits'}`, formatAgo(end - start)].join(' · '),
    outcome,
  };
}

/** The calendar every lane shares: whole days from the first plan to now, with a little room after. */
export function lifecycleCalendar(rows, now = Date.now()) {
  const day0 = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const t0 = day0(Math.min(...rows.map((r) => r.start)));
  const t1 = day0(Math.max(now, ...rows.map((r) => r.end))) + DAY;
  const days = [];
  for (let t = t0; t <= t1; t = day0(t + DAY * 1.5)) days.push(t);
  return { t0, t1, days };
}

// Labels every day when they fit, else every week (Mondays), else the 1st of each month.
function dayLabels(days, pxPerDay) {
  const every = pxPerDay >= 26 ? 'day' : pxPerDay >= 5 ? 'week' : 'month';
  return days.filter((t) => {
    const d = new Date(t);
    return every === 'day' || (every === 'week' ? d.getDay() === 1 : d.getDate() === 1);
  });
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const LINE = {
  planned: { stroke: INK.muted, strokeWidth: STROKE.ink, strokeDasharray: DASH.medium },
  building: { stroke: INK.fg, strokeWidth: 3 },
  waiting: { stroke: INK.muted, strokeWidth: STROKE.hair },
};

function EndMark({ x, y, mark }) {
  if (mark === 'live') {
    return (
      <g className="fig-glow fig-live" style={{ transform: `translate(${x}px, ${y}px)` }}>
        <circle r={7} style={{ fill: 'none', stroke: INK.lamp, strokeWidth: 0.8 }} strokeDasharray="1 2" />
        <circle r={4} style={{ fill: INK.lamp }} />
      </g>
    );
  }
  if (mark === 'done') return <circle cx={x} cy={y} r={4} style={{ fill: INK.fg }} />;
  return <circle cx={x} cy={y} r={3.5} style={{ fill: INK.paper, stroke: INK.muted, strokeWidth: STROKE.hair }} strokeDasharray={mark === 'stopped' ? '1.5 1.5' : undefined} />;
}

/** Meridians at each day and the now line, behind a lane or the calendar. */
function Grid({ days, x, now, h, w }) {
  return (
    <g aria-hidden="true">
      {days.map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={h} style={{ stroke: INK.faint, strokeWidth: STROKE.hair, opacity: 0.35 }} strokeDasharray="1 3" />
      ))}
      {now <= x.t1 && <line x1={x(now)} x2={x(now)} y1={0} y2={h} style={{ stroke: INK.faint, strokeWidth: STROKE.hair }} strokeDasharray={DASH.fine} />}
      <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
    </g>
  );
}

function Lane({ row, x, w, days, now }) {
  const ink = row.shelved ? { opacity: 0.45 } : undefined;
  const xs = x(row.start);
  const xe = x(row.end);
  return (
    <svg width={w} height={ROW_H} className="block" aria-hidden="true">
      <Grid days={days} x={x} now={now} h={ROW_H} w={w} />
      <g style={ink}>
        {row.segments.map((s) => (
          <line key={s.kind} x1={x(s.from)} x2={Math.max(x(s.from) + 1, x(s.to))} y1={LANE_Y} y2={LANE_Y} style={LINE[s.kind]} />
        ))}
        {/* An open plan's time still to come trails off past now. */}
        {row.endMark === 'open' && <line x1={xe + 5} x2={Math.min(w, xe + 40)} y1={LANE_Y} y2={LANE_Y} style={{ stroke: INK.faint, strokeWidth: STROKE.hair }} strokeDasharray={DASH.sparse} />}
        <circle cx={xs} cy={LANE_Y} r={3} style={{ fill: INK.paper, stroke: INK.muted, strokeWidth: STROKE.hair }} />
        {row.pr != null && (
          <path d={`M${x(row.pr)} ${LANE_Y - 5}L${x(row.pr) + 5} ${LANE_Y}L${x(row.pr)} ${LANE_Y + 5}L${x(row.pr) - 5} ${LANE_Y}Z`} style={{ fill: INK.paper, stroke: INK.fg, strokeWidth: STROKE.ink }} />
        )}
        <EndMark x={xe} y={LANE_Y} mark={row.endMark} />
      </g>
    </svg>
  );
}

function Calendar({ days, x, w, now, pxPerDay }) {
  const labelled = dayLabels(days, pxPerDay);
  let month = null;
  return (
    <svg width={w} height={34} className="block" aria-hidden="true">
      <Grid days={days} x={x} now={now} h={34} w={w} />
      {labelled.map((t) => {
        const d = new Date(t);
        const m = d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
        const text = m !== month ? `${m} ${d.getDate()}` : String(d.getDate());
        month = m;
        return <T key={t} x={x(t) + 3} y={14} color={INK.muted}>{text}</T>;
      })}
      {now <= x.t1 && <T x={x(now)} y={28} anchor="middle" color={INK.fg} halo>now</T>}
    </svg>
  );
}

/** The legend: each stage's line, drawn as on the lanes. */
export function LifecycleKey() {
  const items = [
    ['planned', <line key="l" x1={0} x2={28} y1={6} y2={6} style={LINE.planned} />],
    ['building', <line key="l" x1={0} x2={28} y1={6} y2={6} style={LINE.building} />],
    ['awaiting merge', <line key="l" x1={0} x2={28} y1={6} y2={6} style={LINE.waiting} />],
    ['PR', <path key="l" d="M14 1L19 6L14 11L9 6Z" style={{ fill: INK.paper, stroke: INK.fg, strokeWidth: STROKE.ink }} />],
    ['merged', <circle key="l" cx={14} cy={6} r={4} style={{ fill: INK.fg }} />],
    ['running now', <g key="l"><circle cx={14} cy={6} r={4} style={{ fill: INK.lamp }} /></g>],
  ];
  return (
    <ul aria-label="Key" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
      {items.map(([label, mark]) => (
        <li key={label} className="flex items-center gap-2">
          <svg width={28} height={12} aria-hidden="true">{mark}</svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The chart: a name column, the lanes on one calendar, and where each plan
 * ended up. `onOpen(id)` opens a plan; j/k or the arrows move between rows.
 */
export function Fig37Lifecycle({ plans, onOpen, now = Date.now(), className }) {
  const [trackRef, w] = useWidth();
  const rows = plans.map((p) => lifecycleRow(p, now)).sort((a, b) => a.start - b.start);
  const cal = lifecycleCalendar(rows, now);
  const pxPerDay = w / Math.max(1, (cal.t1 - cal.t0) / DAY);
  const x = (t) => ((t - cal.t0) / (cal.t1 - cal.t0)) * w;
  x.t1 = cal.t1;

  const move = (e) => {
    const step = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const list = [...e.currentTarget.parentElement.querySelectorAll('[data-lane]')];
    list[list.indexOf(e.currentTarget) + step]?.focus();
  };

  return (
    <div className={cn('grid min-h-0 grid-cols-[minmax(180px,280px)_1fr_minmax(140px,200px)] text-[11px]', className)}>
      <div className="sticky top-0 z-10 col-span-3 grid grid-cols-subgrid bg-[var(--ins-raised)]">
        <span className="ins-legend self-end pb-2">plan</span>
        <div ref={trackRef} className="min-w-0">{w > 0 && <Calendar days={cal.days} x={x} w={w} now={now} pxPerDay={pxPerDay} />}</div>
        <span className="ins-legend self-end pb-2 pl-4">where it stands</span>
      </div>
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          data-lane
          onClick={() => onOpen?.(row.id)}
          onKeyDown={move}
          title={`${row.title}\nOpen the plan`}
          className={cn(
            'group col-span-3 grid grid-cols-subgrid items-center text-left outline-none hover:bg-[color-mix(in_srgb,var(--color-foreground)_6%,transparent)] focus-visible:shadow-[inset_0_0_0_1px_var(--ins-legend)]',
            row.shelved && 'text-muted-foreground',
          )}
        >
          <span className="flex min-w-0 flex-col pr-3 leading-tight">
            <span className={cn('ins-name truncate text-[13px]', row.shelved ? 'text-muted-foreground' : 'text-foreground')}>{row.title}</span>
            <span className="truncate tabular-nums text-muted-foreground">{row.note}</span>
          </span>
          <span className="min-w-0">{w > 0 && <Lane row={row} x={x} w={w} days={cal.days} now={now} />}</span>
          <span className="flex min-w-0 flex-col pl-4 leading-tight">
            <span className={cn('ins-name truncate text-[13px]', row.endMark === 'live' ? 'text-[var(--ins-lamp)]' : row.shelved ? 'text-muted-foreground' : 'text-foreground')}>{row.outcome.name}</span>
            <span className="truncate tabular-nums text-muted-foreground">{row.outcome.note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
