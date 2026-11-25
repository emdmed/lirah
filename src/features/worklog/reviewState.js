// Where each flag and assumption of the changes stands. Answers are the user's
// own marks, kept in worklog/answers.json as { '<entryId>:F1': { s, at } }.

/** A flag's answers key. shortcut: an unnumbered flag is keyed by its text, so an edited text loses its answer. */
export const flagKey = (f) => `${f.entry}:${f.n ?? `F:${f.text}`}`;
/** An assumption's answers key. */
export const assumptionKey = (a) => `${a.entry}:A${a.i}`;

/**
 * `changes` (groupChanges'), `entries` (the work log) and `answers` → { [key]: state }.
 * A flag is 'answered' once a later prompt of its session names it ('address f2 and f5'),
 * else its answer ('asked' | 'dismissed') or 'open'. An assumption is its answer
 * ('right' | 'wrong') or 'unchecked'.
 */
export function reviewState(changes, entries, answers = {}) {
  const named = new Map(); // session -> [{ at, ns: Set('F2') }]
  for (const e of entries) {
    if (!e.session || !e.prompt) continue;
    const ns = new Set([...e.prompt.matchAll(/\bf(\d+)\b/gi)].map((m) => `F${m[1]}`));
    if (ns.size) named.set(e.session, [...(named.get(e.session) ?? []), { at: e.at, ns }]);
  }
  const state = {};
  for (const c of changes) {
    for (const f of c.flags ?? []) {
      const key = flagKey(f);
      const closed = f.n && f.session && named.get(f.session)?.some((p) => p.at > f.at && p.ns.has(f.n));
      state[key] = closed ? 'answered' : answers[key]?.s ?? 'open';
    }
    for (const a of c.assumptions ?? []) {
      const key = assumptionKey(a);
      state[key] = answers[key]?.s ?? 'unchecked';
    }
  }
  return state;
}
