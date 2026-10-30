// FIG numbers are stable: once a figure ships under a number, the number
// stays with it, so docs and commands can cite "FIG.10". Gaps are figures
// that were drawn and dropped; never reuse them.
export const FIGURES = Object.freeze({
  6: { key: 'context', title: 'CONTEXT' },
  9: { key: 'autopilot', title: 'AUTO-PILOT' },
  10: { key: 'sandbox', title: 'SANDBOX' },
  11: { key: 'merge', title: 'AUTO MERGE' },
  12: { key: 'race', title: 'RACE' },
  13: { key: 'agents', title: 'AGENTS' },
  14: { key: 'budget', title: 'BUDGET' },
  15: { key: 'keys', title: 'KEYS' },
  16: { key: 'chunks', title: 'CHUNKS' },
  19: { key: 'detail', title: 'DETAIL LEVELS' },
  20: { key: 'timeline', title: 'PLAN TIMELINE' },
  21: { key: 'plan-git', title: 'PLAN GIT' },
  22: { key: 'files-by-chunk', title: 'FILES BY CHUNK' },
});

// The FIG number for a figure key, e.g. figNumber('sandbox') === 10.
export function figNumber(key) {
  const hit = Object.entries(FIGURES).find(([, f]) => f.key === key);
  return hit ? Number(hit[0]) : null;
}
