const MIN_TERM_COLS = 70;

// Puts tabId into column `slot` (0-based; null = the focused tab's column). A slot
// past the end adds a column. A tab already on screen swaps places instead.
export function placeColumn(cols, focused, tabId, slot) {
  const out = cols.length ? [...cols] : [focused];
  const from = out.indexOf(tabId);
  const to = slot ?? Math.max(0, out.indexOf(focused));
  if (to >= out.length) {
    if (from >= 0) out.splice(from, 1);
    out.push(tabId);
  } else {
    if (from >= 0) out[from] = out[to];
    out[to] = tabId;
  }
  return out.slice(0, 3);
}

// Refuses n side-by-side columns when each would get fewer than ~70 terminal
// columns. The cell is measured as xterm does: 'W' in the terminal's font (14px, --font-mono).
export function assertColumnRoom(n) {
  const box = document.querySelector('[data-tab-pane]')?.parentElement?.clientWidth;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!box || !ctx) return;
  ctx.font = `14px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace'}`;
  const each = Math.floor(box / n / ctx.measureText('W').width);
  if (each < MIN_TERM_COLS) {
    throw new Error(`too narrow for ${n} columns: ~${each} terminal columns each, needs ~${MIN_TERM_COLS}`);
  }
}
