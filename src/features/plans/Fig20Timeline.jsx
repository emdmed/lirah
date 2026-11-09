import { CalRecipe } from '@/components/instrument/calibrated';
import { FIGURES, figNumber } from '@/components/instrument/figure';
import { formatDuration } from '../../lib/formatDuration';
import { useTick } from '../../hooks/useTick';
import { AUTOPILOT_STATUS, CHUNK_STATUS, isAutopilotLive, planProgress } from './planModel';

// FIG.20: the plan's working time as Lirah's timelineToned recipe (the
// calibrated timeline recipe plus breaks, a tail and a count;
// components/instrument/calibrated/recipes). One span per implemented chunk,
// laid end to end by its own duration, numbered by chunk, on one ruler of
// working time. Idle time between chunks is folded out; a gap over two
// minutes leaves a break mark on the line and the ruler. The chunk in flight
// while auto-pilot runs ends in the lamp star; once the run stops, the
// slowest chunk is drawn heavy and called out. What's still ahead follows as
// an unmeasured dashed tail labelled with what's left, headed by a warn
// square when a chunk was sent but has no commit. The n/N count sits at the
// right end (showCount). The run's wall time and idle time go to the tooltip. The line runs out when it first shows and again each time
// a chunk finishes; the live clock redraws it still. Compact shows `fallback`.

const MIN_W = 300;
const MAX_W = 560;
const BREAK_AFTER = 2 * 60_000;

const timed = (c) => c.startedAt && c.doneAt && c.doneAt >= c.startedAt;

/**
 * The timeline's numbers, pure. `now` closes the live chunk's span while
 * auto-pilot runs. Spans are in start order; `gapBefore` is the idle time
 * since the previous span ended (0 for the first). `total` is the wall time
 * of the run when auto-pilot covered every span, else the summed work.
 */
export function planTimeline(plan, now = Date.now()) {
  const ap = plan.autopilot || {};
  const running = ap.status === AUTOPILOT_STATUS.RUNNING;
  const spans = plan.chunks
    .filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED && timed(c))
    .map((c) => ({ n: c.n, title: c.title, start: c.startedAt, end: c.doneAt, live: false }));
  const liveChunk = running
    ? plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS && c.startedAt && c.startedAt <= now)
    : null;
  if (liveChunk) spans.push({ n: liveChunk.n, title: liveChunk.title, start: liveChunk.startedAt, end: now, live: true });
  spans.sort((a, b) => a.start - b.start);

  let prevEnd = null;
  for (const s of spans) {
    s.dur = s.end - s.start;
    s.gapBefore = prevEnd == null ? 0 : Math.max(0, s.start - prevEnd);
    s.broken = s.gapBefore > BREAK_AFTER;
    prevEnd = prevEnd == null ? s.end : Math.max(prevEnd, s.end);
  }
  const work = spans.reduce((a, s) => a + s.dur, 0);

  // Auto-pilot's wall time only when every span falls inside its window;
  // chunks run by hand before it started would overrun the total.
  const windowEnd = ap.status === AUTOPILOT_STATUS.DONE ? ap.endedAt : running ? now : null;
  const inWindow = ap.startedAt && windowEnd && spans.every((s) => s.start >= ap.startedAt && s.end <= windowEnd);
  const kind = inWindow ? (running ? 'elapsed' : 'complete') : 'chunks';
  const total = inWindow ? windowEnd - ap.startedAt : work;
  const idle = inWindow ? Math.max(0, total - work) : null;

  const done = spans.filter((s) => !s.live);
  // A look back, so it waits until the run is over (a paused run still needs you).
  const slowest = !isAutopilotLive(ap) && done.length >= 2 ? done.reduce((a, s) => (s.dur > a.dur ? s : a)) : null;
  // Ahead: a chunk sent but not committed (outside a live run), and what's left after it.
  const stuck = liveChunk ? null : plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS) ?? null;
  const left = plan.chunks.filter((c) => c.status !== CHUNK_STATUS.IMPLEMENTED && c.status !== CHUNK_STATUS.SKIPPED
    && c.id !== liveChunk?.id).length;
  return { spans, work, total, idle, kind, slowest, running, stuck, left };
}

// The dimension's word for the summed work, by the kind of total.
const KIND_LABEL = { chunks: 'worked', elapsed: 'worked so far', complete: 'worked' };

/**
 * The plan's timeline, drawn at its container's width. Until a chunk has a
 * time (or narrower than MIN_W, or compact) it shows `fallback`.
 */
export function Fig20Timeline({ plan, fallback, showCount = true, paper = 'var(--ins-panel)' }) {
  const running = plan.autopilot?.status === AUTOPILOT_STATUS.RUNNING;
  const now = useTick(running);
  const t = planTimeline(plan, now);
  if (!t.spans.length || !(t.work > 0)) return <div className="min-w-0">{fallback}</div>;

  const { done: doneN, total: totalN } = planProgress(plan);
  const live = t.spans.findIndex((s) => s.live);
  const label = `Plan timeline, ${doneN} of ${totalN} chunks: ${[
    `${t.kind === 'chunks' ? 'worked' : t.kind} ${formatDuration(t.total)}`,
    `${t.spans.length} chunk${t.spans.length === 1 ? '' : 's'} worked ${formatDuration(t.work)}`,
    t.idle != null && `idle ${formatDuration(t.idle)}`,
    t.slowest && `slowest chunk ${t.slowest.n}, ${formatDuration(t.slowest.dur)}`,
    t.stuck && `chunk ${t.stuck.n} has no commit yet`,
    t.left > 0 && `${t.left} left`,
  ].filter(Boolean).join('; ')}.`;

  const data = {
    steps: t.spans.map((s) => s.dur / 1000),
    names: t.spans.map((s) => s.n),
    noun: 'chunk',
    live: live >= 0 ? live : undefined,
    slowest: !!t.slowest,
    totalLabel: KIND_LABEL[t.kind],
    breaks: t.spans.map((s, i) => (s.broken ? i : -1)).filter((i) => i > 0),
    tail: t.left > 0 || t.stuck
      ? { label: t.left > 0 ? `${t.left} left` : '', stuck: !!t.stuck, ink: 'var(--ins-warn)' }
      : undefined,
    count: showCount ? `${doneN}/${totalN}` : undefined,
    label,
  };

  return (
    <div className="min-w-0" title={label}>
      <CalRecipe
        recipe="timelineToned"
        replayKey={t.spans.filter((s) => !s.live).length}
        title={FIGURES[figNumber('timeline')].title}
        data={data}
        fit={{ min: MIN_W, max: MAX_W }}
        paper={paper}
        fallback={fallback}
      />
    </div>
  );
}
