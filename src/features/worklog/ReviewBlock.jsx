import { INK } from '../../components/instrument/figure';
import { assumptionKey, flagKey } from './reviewState';

// A change's (or the talk row's) review: what the agent flagged, assumed and
// decided, each line with its time and its own actions. Done lines go muted.

export const clock = (at) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const OPEN = new Set(['open', 'unchecked']);
const UNDOABLE = new Set(['asked', 'dismissed', 'right', 'wrong']); // 'answered' comes from a later prompt, not a mark

// Marker shapes by kind: a flag is a lit warn tag, an assumption a dashed
// (unconfirmed) outline, a decision a filled (settled) plate. Once handled a
// marker goes quiet; a checked assumption takes ok or fault.
const MARK = {
  flag: { color: INK.warn, borderColor: INK.warn, background: 'color-mix(in srgb, var(--ins-warn) 16%, transparent)', fontWeight: 500 },
  assumption: { color: INK.fg, borderColor: INK.fg, borderStyle: 'dashed' },
  decision: { color: INK.paper, borderColor: INK.muted, background: INK.muted, fontWeight: 500 },
  right: { color: INK.ok, borderColor: INK.ok },
  wrong: { color: INK.fault, borderColor: INK.fault },
  done: { color: INK.faint, borderColor: INK.edgeStrong },
};
const markFor = (kind, state) => (!state || OPEN.has(state) ? MARK[kind] : MARK[state] ?? MARK.done);

/** '2 open flags · 1 assumption · 3 decisions', zero parts left out; `warn` when a flag is open. */
export function reviewCounts({ flags = [], assumptions = [], decided = [] }, review) {
  const open = flags.filter((f) => review[flagKey(f)] === 'open').length;
  const text = [open && plural(open, 'open flag'), assumptions.length && plural(assumptions.length, 'assumption'), decided.length && plural(decided.length, 'decision')]
    .filter(Boolean).join(' · ');
  return { text, warn: open > 0 };
}

/**
 * `flags`, `assumptions` and `decided` as three groups, empty ones hidden.
 * `act` = { review, prompts, answer(key, s), unanswer(key), ask(flag), wrong(assumption) }.
 */
export function ReviewBlock({ flags = [], assumptions = [], decided = [], act, heading }) {
  if (!flags.length && !assumptions.length && !decided.length) return null;
  const { review, prompts } = act;
  const openFlags = flags.filter((f) => review[flagKey(f)] === 'open').length;
  const line = (key, box, text, it, state, actions) => {
    const done = state && !OPEN.has(state);
    return (
      <li
        key={key}
        tabIndex={-1}
        data-open-flag={state === 'open' ? '' : undefined}
        className={`flex items-baseline gap-2 outline-none focus-visible:bg-foreground/10 ${done ? 'text-muted-foreground' : ''}`}
      >
        {box}
        <span className={`min-w-0 flex-1 ${done ? 'line-through decoration-[var(--ins-faint)]' : 'text-foreground'}`}>{text}</span>
        {done ? <><span aria-label={state}>✓ {state}</span>{UNDOABLE.has(state) && <button type="button" className="tui-btn" onClick={() => act.unanswer(key)}>undo</button>}</> : actions}
        <span className="shrink-0 tabular-nums text-muted-foreground" title={prompts.get(it.entry) ?? ''}>{clock(it.at)}</span>
      </li>
    );
  };
  const box = (label, style) => (
    <span className="inline-flex h-[17px] min-w-[1.75rem] shrink-0 items-center justify-center rounded-sm border px-1 text-[10px] leading-none tabular-nums" style={style}>{label}</span>
  );
  const group = (title, items, count = items.length) => items.length > 0 && (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{title} · {count}</span>
      <ul className="flex flex-col gap-0.5">{items}</ul>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5 pt-1 text-[11px]">
      {heading && <span className="text-muted-foreground">{heading}</span>}
      {group('flagged', flags.map((f) => {
        const key = flagKey(f);
        return line(key, box(f.n ?? 'F', markFor('flag', review[key])), f.text, f, review[key], (
          <>
            <button type="button" className="tui-btn" onClick={() => act.ask(f)}>ask agent</button>
            <button type="button" className="tui-btn" onClick={() => act.answer(key, 'dismissed')}>dismiss</button>
          </>
        ));
      }), openFlags ? `${openFlags} open` : flags.length)}
      {group('assumed', assumptions.map((a) => {
        const key = assumptionKey(a);
        return line(key, box('A', markFor('assumption', review[key])), a.text, a, review[key], (
          <>
            <button type="button" className="tui-btn" onClick={() => act.answer(key, 'right')}>right</button>
            <button type="button" className="tui-btn" onClick={() => act.wrong(a)}>wrong</button>
          </>
        ));
      }))}
      {group('decided', decided.map((d, i) => line(`${d.entry}:D${i}`, box('D', MARK.decision), d.text, d, null, null)))}
    </div>
  );
}
