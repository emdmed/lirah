import { CalRecipe, Calibrated } from '@/components/instrument/calibrated';
import { INK } from '@/components/instrument/figure';
import { formatTimer } from '../../lib/formatDuration';
import { useTick } from '../../hooks/useTick';
import { usePageVisible } from '../../hooks/usePageVisible';

// FIG 12: a race as Lirah's lanesToned recipe (the calibrated lanes recipe
// plus late starts and failed runs; components/instrument/calibrated/recipes).
// One lane per candidate on a shared time ruler from the first start, each
// from its own start to its end (or now), with a dimension line giving its
// time. The running lane is the only lit one (lamp, live star, crawling
// tail); a failed lane is fault ink ending in a red ×, a stopped one muted
// with an open node. The full version boxes each lane's end with typecheck over diff;
// `short` (the sidebar race group) drops the title and boxes. Lanes replay
// and latch in finish order when the figure first shows and again each time
// a candidate finishes; the live clock redraws it still. Compact, or narrower
// than the recipe's floor, shows `fallback`.

const FIT = { full: { min: 360, max: 720 }, short: { min: 300, max: 480 } };
const NAME_CHARS = 12;
const PER = { s: 1, m: 60, h: 3600 };

// A candidate's own label is the race label plus its agent; next to the
// other candidates only the distinguishing tail matters.
export function shortLabel(job) {
  const tail = job.label?.split(' · ').pop();
  return tail || job.cli;
}

// The race's label: a candidate's label without its agent suffix.
function raceLabel(job) {
  const parts = (job?.label || '').split(' · ');
  return parts.length > 1 ? parts.slice(0, -1).join(' · ') : parts[0];
}

function fit(text, chars) {
  const s = String(text);
  return s.length <= chars ? s : `${s.slice(0, Math.max(1, chars - 1))}…`;
}

function laneState(job) {
  if (job.status === 'running') return 'live';
  if (job.status === 'failed') return 'failed';
  if (job.status === 'cancelled' || job.status === 'interrupted') return 'stopped';
  return 'done';
}

// End box text: typecheck over diff. Pure, for reuse and tests.
export function endBox(job) {
  const tc = job.typecheck;
  let check = { text: 'unchecked', color: INK.faint };
  if (tc?.status === 'checking') check = { text: 'tsc …', color: INK.muted };
  else if (tc?.status === 'done') {
    check = tc.errorCount > 0
      ? { text: `tsc ${tc.errorCount} error${tc.errorCount === 1 ? '' : 's'}`, color: INK.fault }
      : { text: 'tsc ok', color: INK.ok };
  }
  const stat = job.diffStat;
  const diff = job.status === 'running'
    ? { running: true }
    : stat && (stat.added > 0 || stat.removed > 0)
      ? { added: stat.added, removed: stat.removed }
      : { none: true };
  return { check, diff };
}
const diffText = (d) => (d.running ? '…' : d.none ? 'no changes' : `+${d.added} −${d.removed}`);

// The ruler's unit and length for the longest lane, in seconds: seconds
// under two minutes, minutes under two hours, else hours; rounded up to 5.
export function raceRuler(maxSecs) {
  const unit = maxSecs < 120 ? 's' : maxSecs < 7200 ? 'm' : 'h';
  const v = maxSecs / PER[unit];
  return { unit, max: Math.max(5, Math.ceil(v / 5) * 5) };
}

export function Fig12Race({ jobs, short = false, fallback = null }) {
  const anyRunning = jobs.some((j) => j.status === 'running');
  // Redraws each second only while a lane is live and the window is shown.
  const visible = usePageVisible();
  const now = useTick(anyRunning && visible);
  if (jobs.length === 0) return fallback;

  const endOf = (j) => (j.status === 'running' ? now : j.endedAt || now);
  // The ruler starts at the first start; a later candidate starts later on it.
  const starts = jobs.map((j) => j.startedAt).filter(Boolean);
  const t0 = starts.length ? Math.min(...starts) : now;
  const secs = jobs.map((j) => (j.startedAt ? Math.max(0, (endOf(j) - j.startedAt) / 1000) : 0));
  const offs = jobs.map((j) => (j.startedAt ? Math.max(0, (j.startedAt - t0) / 1000) : 0));
  const { unit, max } = raceRuler(Math.max(1, ...secs.map((v, i) => v + offs[i])));
  const names = jobs.map((j) => fit(shortLabel(j), short ? 8 : NAME_CHARS));
  const labelW = Math.max(...names.map((n) => Calibrated.textWidth(n))) + 16;

  const lanes = jobs.map((job, i) => {
    const state = laneState(job);
    const { check, diff } = endBox(job);
    const box = { live: ['running', check.text], failed: ['failed', diffText(diff)], stopped: ['stopped', diffText(diff)] }[state]
      ?? [check.text, diffText(diff)];
    return {
      name: names[i],
      start: offs[i] / PER[unit],
      end: (offs[i] + secs[i]) / PER[unit],
      fault: state === 'failed',
      stopped: state === 'stopped',
      label: job.startedAt ? formatTimer(secs[i] * 1000) : '—',
      live: state === 'live',
      box: short ? undefined : box,
    };
  });

  const race = raceLabel(jobs[0]);
  const title = short ? undefined : `RACE · ${race ? `${race} · ` : ''}${jobs.length} AGENT${jobs.length === 1 ? '' : 'S'}`;
  const label = `Race${race ? ` "${race}"` : ''}, ${jobs.length} candidate${jobs.length === 1 ? '' : 's'}: ${jobs
    .map((j, i) => {
      const state = laneState(j);
      const { check, diff } = endBox(j);
      const verb = { live: 'running', failed: 'failed', stopped: 'stopped', done: 'done' }[state];
      return `${shortLabel(j)} ${verb}${j.startedAt ? ` ${lanes[i].label}` : ''}${state === 'live' ? '' : `, ${check.text}, ${diffText(diff)}`}`;
    })
    .join('; ')}.`;

  return (
    <div className="min-w-0" title={label}>
      <CalRecipe
        recipe="lanesToned"
        title={title}
        data={{ lanes, max, unit, labelW, label }}
        fit={FIT[short ? 'short' : 'full']}
        replayKey={jobs.filter((j) => j.status !== 'running').length}
        fallback={fallback}
      />
    </div>
  );
}
