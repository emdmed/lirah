const NUMBERED = /^(D\d+):\s*(.*)$/;

/**
 * Which numbered decisions later chunks built on, pure. Decisions come from each
 * chunk's `D7: text` lines (unnumbered ones are left out), links from later chunks' buildsOn.
 * Returns { decisions: [{ id, chunk, text }], links: [{ from, to }] }.
 */
export function decisionLinks(plan) {
  const chunks = plan?.chunks ?? [];
  const decisions = [];
  for (const c of chunks) {
    for (const line of c.decisions ?? []) {
      const m = String(line).match(NUMBERED);
      if (m && !decisions.some((d) => d.id === m[1])) decisions.push({ id: m[1], chunk: c.n, text: m[2] });
    }
  }
  const links = [];
  for (const c of chunks) {
    for (const id of c.buildsOn ?? []) {
      const d = decisions.find((x) => x.id === id);
      if (d && c.n > d.chunk && !links.some((l) => l.from === id && l.to === c.n)) links.push({ from: id, to: c.n });
    }
  }
  return { decisions, links };
}

/** True once any chunk recorded a Builds on: line; older plans have none. */
export const hasBuildsOn = (plan) => (plan?.chunks ?? []).some((c) => c.buildsOn?.length);
