import { clock } from './ReviewBlock';
import { dayLayout, dayNumbers } from './dayLayout';
import { assumptionKey, flagKey } from './reviewState';

// What is still to review, above the feature rows: a day lists its open flags,
// unchecked assumptions and untested changes, each led by its FIG.41 number;
// a week only counts them.

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The open items of `changes`, as reviewState left them. */
function openItems(changes, review) {
  const flags = changes.flatMap((c) => (c.flags ?? []).filter((f) => review[flagKey(f)] === 'open').map((f) => ({ c, f })));
  const assumptions = changes.flatMap((c) => (c.assumptions ?? []).filter((a) => review[assumptionKey(a)] === 'unchecked').map((a) => ({ c, a })));
  return { flags, assumptions, untested: changes.filter((c) => !c.tests?.length) };
}

/**
 * `ch` is useChanges'; `act` the ReviewBlock actions; `onShow(change)` focuses the change in the list.
 * `day` is the shown 'YYYY-MM-DD', or null in week mode.
 */
export function ReviewQueue({ ch, act, title, day, today, onShow }) {
  const { flags, assumptions, untested } = openItems(ch.changes, ch.review);
  const muted = 'px-1 pb-2 text-[11px] text-muted-foreground';
  if (!flags.length && !assumptions.length && !untested.length) return <p className={muted}>nothing open {day && day !== today ? 'that day' : day ? 'today' : 'this week'}</p>;
  if (!day) {
    return <p className={muted}>to review · {[plural(flags.length, 'open flag'), plural(assumptions.length, 'unchecked assumption'), `${untested.length} without a unit test`].join(' · ')}</p>;
  }

  const l = dayLayout(ch.features, ch.talk, ch.releases, day);
  const num = l ? dayNumbers(l.lanes) : new Map();
  const line = (key, c, text, at, actions) => (
    <li key={key} className="flex items-baseline gap-2">
      <span className="inline-flex min-w-[1.5rem] shrink-0 justify-end tabular-nums text-muted-foreground">{num.get(c.id) ?? '·'}</span>
      <button type="button" className="min-w-0 flex-1 truncate text-left text-foreground hover:underline" onClick={() => onShow(c)} title="Show in the list">{text}</button>
      {actions}
      <span className="shrink-0 tabular-nums text-muted-foreground">{clock(at)}</span>
    </li>
  );
  const group = (name, items) => items.length > 0 && (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{name} · {items.length}</span>
      <ul className="flex flex-col gap-0.5">{items}</ul>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5 px-1 pb-3 pt-1 text-[11px] edge-b-engraved" aria-label="To review">
      <span className="text-muted-foreground">to review</span>
      {group('open flags', flags.map(({ c, f }) => line(flagKey(f), c, `${f.n ? `${f.n} ` : ''}${f.text}`, f.at, (
        <>
          <button type="button" className="tui-btn" onClick={() => act.ask(f)}>ask agent</button>
          <button type="button" className="tui-btn" onClick={() => act.answer(flagKey(f), 'dismissed')}>dismiss</button>
        </>
      ))))}
      {group('assumptions', assumptions.map(({ c, a }) => line(assumptionKey(a), c, a.text, a.at, (
        <>
          <button type="button" className="tui-btn" onClick={() => act.answer(assumptionKey(a), 'right')}>right</button>
          <button type="button" className="tui-btn" onClick={() => act.wrong(a)}>wrong</button>
        </>
      ))))}
      {group('no unit test', untested.map((c) => line(c.id, c, title(c), c.start, null)))}
    </div>
  );
}
