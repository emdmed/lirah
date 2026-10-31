import { useLayoutEffect, useRef, useState } from 'react';
import { FIGURES, figNumber, useFigureCompact } from '@/components/instrument/figure';
import '@/components/instrument/calibrated';
import { formatDuration } from '../../lib/formatDuration';
import { CHUNK_STATUS } from './planModel';

// FIG.16: a plan's chunks as a calibrated <cal-progress>. Done chunks are
// filled, the one in flight is the lamp star, the rest are outlined; skipped
// chunks leave the count. A dimension over the done run gives their summed
// working time; once two are done, the live star's caption estimates what's
// left at the mean pace. Compact is the node line alone.

const MIN_W = 180;
const C_MIN_W = 120;
const STEP = 18; // the element's own node pitch, kept while it fits

const isLive = (c) => c.status === CHUNK_STATUS.IN_PROGRESS || c.awaitingFix;

/**
 * The ruler's numbers, pure: each counted chunk's node state, the done
 * chunks' summed time, and the estimate for the rest (null until two timed
 * chunks are done).
 */
export function chunkRuler(plan) {
  const counted = plan.chunks.filter((c) => c.status !== CHUNK_STATUS.SKIPPED);
  const states = counted.map((c) => (isLive(c) ? 'live' : c.status === CHUNK_STATUS.IMPLEMENTED ? 'done' : 'todo'));
  const doneChunks = counted.filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED);
  const timed = doneChunks
    .filter((c) => c.startedAt && c.doneAt && c.doneAt >= c.startedAt)
    .map((c) => c.doneAt - c.startedAt);
  const spent = timed.reduce((a, b) => a + b, 0);
  const remaining = counted.length - doneChunks.length;
  const estimate = timed.length >= 2 && remaining > 0 ? (spent / timed.length) * remaining : null;
  return {
    states,
    done: doneChunks.length,
    total: counted.length,
    spent: timed.length ? spent : null,
    estimate,
    live: states.indexOf('live'),
  };
}

// done… then at most one live, then todo…: the shape <cal-progress> can
// animate from done/total/live. Any other shape is passed as a states list.
function isPrefix(states) {
  const order = { done: 0, live: 1, todo: 2 };
  return states.every((s, i) => i === 0 || order[states[i - 1]] <= order[s])
    && states.filter((s) => s === 'live').length <= 1;
}

/**
 * The tab plan tier's chunk progress, sized to its container. Narrower than
 * MIN_W it shows `fallback`. `label` leads the tooltip; the times follow it.
 */
export function Fig16Chunks({ plan, label, fallback }) {
  const compact = useFigureCompact();
  const rootRef = useRef(null);
  const [rootW, setRootW] = useState(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    setRootW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setRootW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const r = chunkRuler(plan);
  const sentence = `${[
    label || `${r.done} of ${r.total} chunks implemented`,
    r.spent != null && `${formatDuration(r.spent)} of work`,
    r.estimate != null && `about ${formatDuration(r.estimate)} left at this pace`,
  ].filter(Boolean).join(', ')}.`;

  const floor = compact ? C_MIN_W : MIN_W;
  const tooNarrow = rootW != null && rootW < floor;
  // Pitch the nodes so the line and its n/N reading fit the pane.
  const room = (rootW ?? 240) - (compact ? 20 : 64);
  const step = r.total > 1 ? Math.max(6, Math.min(STEP, Math.floor(room / (r.total - 1)))) : STEP;

  const attrs = isPrefix(r.states)
    ? { done: r.done, total: r.total, live: r.live >= 0 ? r.live + 1 : undefined }
    : { states: r.states.join(',') };

  return (
    <div
      ref={rootRef}
      className="cal min-w-0"
      title={sentence}
      data-density={compact ? 'compact' : 'full'}
      style={{ '--fig-paper': 'var(--ins-well)' }}
    >
      {tooNarrow ? fallback : (<>
        {!compact && <span className="engraved-label mb-1.5 block text-muted-foreground">{FIGURES[figNumber('chunks')].title}</span>}
        <cal-progress
          {...attrs}
          step={step}
          done-label={r.spent != null ? `${r.done} done · ${formatDuration(r.spent)}` : undefined}
          live-label={r.estimate != null && r.live >= 0 ? `≈ ${formatDuration(r.estimate)} left` : undefined}
        />
      </>)}
    </div>
  );
}
