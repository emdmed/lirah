// Worklog entries → changes: the runs of turns that built one thing. Turns run
// together per Claude session (or per cwd, broken by a 20-minute gap, for
// entries logged before start lines carried the session). A turn joins the
// open change it shares a file with; a turn with only new files starts its
// own; a turn with no files joins the newest open change when its prompt is a
// follow-up ("yes", "do it"), else it is talk. "ship it" closes them all.
const GAP_MS = 20 * 60 * 1000;
const SHIP = /^\s*ship (it|this)\b/i;
const FOLLOW_UP = /^\s*(yes|yep|yeah|ok(ay)?|sure|continue|go( ahead| on)?|do it|apply\b|proceed|implement it)\b/i;

const dayKey = (at) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * `entries` (parseLog's, oldest first, one repo) → { changes, talk, talkItems, unmapped }.
 * changes: [{ id, session, start, end, turns, days, prompts, files, decisions, decided, flags, assumptions, feature, features }],
 * days the { 'YYYY-MM-DD': turns } of its turns, flags [{ n, text, entry, at, session }] and
 * assumptions [{ text, entry, at, session, i }] (i its index in the turn's) from its turns' replies,
 * decided its decisions as [{ text, entry, at, session }],
 * feature the id owning most of its files, features every feature id touched (most files first);
 * talk: { 'YYYY-MM-DD': turns } of file-less turns that joined nothing, talkItems
 * { 'YYYY-MM-DD': [{ kind: 'decision' | 'flag' | 'assumption', text, at, entry, session, n?, i? }] } their reply lines;
 * unmapped: the changes' files no feature of `featureMap` lists.
 */
export function groupChanges(entries, { featureMap } = {}) {
  const changes = [];
  const talk = {};
  const talkItems = {};
  const runs = new Map(); // session or cwd key -> { last, open: [change] }
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    const key = e.session ? `s:${e.session}` : `c:${e.cwd || e.repo}`;
    let run = runs.get(key);
    if (!run || (!e.session && e.at - run.last > GAP_MS)) runs.set(key, (run = { open: [] }));
    run.last = e.endedAt ?? e.at;
    if (SHIP.test(e.prompt)) {
      run.open = [];
      continue;
    }
    const files = e.files ?? []; // still running: nothing changed yet
    let change = files.length
      ? run.open.findLast((c) => files.some((f) => c.files.has(f)))
      : FOLLOW_UP.test(e.prompt) ? run.open.at(-1) : null;
    if (!change) {
      if (!files.length) {
        const day = dayKey(e.at);
        talk[day] = (talk[day] ?? 0) + 1;
        const items = [
          ...(e.decisions ?? []).map((text) => ({ kind: 'decision', text })),
          ...(e.flags ?? []).map((f) => ({ kind: 'flag', ...f })),
          ...(e.assumptions ?? []).map((text, i) => ({ kind: 'assumption', text, i })),
        ].map((it) => ({ ...it, at: e.at, entry: e.id, session: e.session ?? null }));
        if (items.length) (talkItems[day] ??= []).push(...items);
        continue;
      }
      change = { id: e.id, session: e.session ?? null, start: e.at, turns: 0, days: {}, prompts: [], files: new Set(), decisions: [], decided: [], flags: [], assumptions: [] };
      changes.push(change);
      run.open.push(change);
    }
    change.end = e.endedAt ?? e.at;
    change.turns += 1;
    change.days[dayKey(e.at)] = (change.days[dayKey(e.at)] ?? 0) + 1;
    change.prompts.push(e.prompt);
    files.forEach((f) => change.files.add(f));
    change.decisions.push(...(e.decisions ?? []));
    const from = { entry: e.id, at: e.at, session: e.session ?? null };
    change.decided.push(...(e.decisions ?? []).map((text) => ({ text, ...from })));
    change.flags.push(...(e.flags ?? []).map((f) => ({ ...f, ...from })));
    change.assumptions.push(...(e.assumptions ?? []).map((text, i) => ({ text, ...from, i })));
  }

  const owners = new Map(); // file -> feature ids
  for (const f of featureMap?.features ?? []) {
    for (const p of f.files ?? []) owners.set(p, [...(owners.get(p) ?? []), f.id]);
  }
  const unmapped = new Set();
  for (const c of changes) {
    c.files = [...c.files].sort();
    const counts = new Map();
    for (const p of c.files) {
      const ids = owners.get(p);
      if (!ids) unmapped.add(p);
      ids?.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    }
    c.features = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    c.feature = c.features[0] ?? null;
  }
  return { changes, talk, talkItems, unmapped: [...unmapped].sort() };
}
