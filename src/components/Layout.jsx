// The night sky behind the panes, after OrrerySky on the website: hairline
// swells plus dust, drawn once from a seeded generator. Panes cover it, so it
// only shows in the gutters and, through the -2rem top, the rail (h-8).
const SKY_W = 1920;
const SKY_H = 1200;
const f = (n) => n.toFixed(1);

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SWELLS = (() => {
  let d = '';
  for (let k = 0; k < SKY_H / 12.5; k++) {
    const y0 = 8 + k * 12.5;
    for (let x = 0; x <= SKY_W; x += 24) d += `${x ? 'L' : 'M'}${x} ${f(y0 + Math.sin(x / 96 + k * 0.7) * 3.2 + Math.sin(x / 41 + k) * 1.1)}`;
  }
  return d;
})();

// Dust as three paths (one per brightness) instead of hundreds of circles: every tab mounts a sky.
const DUST = (() => {
  const r = rng(7);
  const paths = ['', '', ''];
  for (let i = 0; i < 480; i++) {
    const x = r() * SKY_W, y = r() * SKY_H, rad = 0.5 + r() * 1.1;
    paths[Math.floor(r() * 3)] += `M${f(x - rad)} ${f(y)}a${f(rad)} ${f(rad)} 0 1 0 ${f(rad * 2)} 0a${f(rad)} ${f(rad)} 0 1 0 ${f(-rad * 2)} 0`;
  }
  return paths;
})();

// Built once: a constant element, so Layout's re-renders never touch it.
export const SKY = (
  <svg
    aria-hidden="true"
    className="absolute inset-x-0 bottom-0 -top-8 w-full h-[calc(100%+2rem)] pointer-events-none"
    viewBox={`0 0 ${SKY_W} ${SKY_H}`}
    preserveAspectRatio="xMidYMin slice"
  >
    <path d={SWELLS} fill="none" stroke="var(--color-foreground)" strokeWidth="1" opacity=".09" vectorEffect="non-scaling-stroke" />
    {DUST.map((d, i) => (
      <path key={i} d={d} fill="var(--color-foreground)" opacity={[0.06, 0.1, 0.15][i]} />
    ))}
  </svg>
);

export function Layout({ sidebar, children, statusBar, textarea, secondaryTerminal }) {
  return (
    <div className="relative p-0 flex flex-col w-full h-full bg-[var(--ins-gutter)]">
      {SKY}
      {/* One gutter everywhere: 12px between frames and at the window edge.
          Frames are inset 6px top and bottom (.tui-pane), so vertical
          spacing is 6px of padding plus that inset; the sidebar's resize
          handle is the 12px gap to its right. */}
      {/* relative: lifts the panes over the sky */}
      <div className="relative flex flex-1 min-h-0 pl-3 pt-1.5 pb-1.5">
        {sidebar}
        {/* min-w-0: without it this row's floor is xterm's canvas width, so a
            narrowing window can't shrink it — it overflows, FitAddon measures
            the overflow and drops a column or two per frame, and the terminal
            crawls to its new width instead of snapping. */}
        <div className="flex-1 flex flex-row gap-3 min-h-0 min-w-0 relative">
          <div className="flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden">
            {children}
            {textarea && (
              // The prompt grows upward over the terminal's last rows instead of
              // shrinking it: a row-count change sends SIGWINCH and the CLI
              // repaints its whole UI. useAutoGrow sets --grow-overlay.
              <div
                data-grow-overlay
                className="ins-pane-enter flex-shrink-0 relative z-10 bg-[var(--ins-gutter)] mt-[calc(var(--grow-overlay,0px)*-1)]"
              >
                {textarea}
              </div>
            )}
          </div>
          {secondaryTerminal}
        </div>
      </div>
      {/* Portals into the tab bar; renders nothing here */}
      {statusBar}
    </div>
  );
}
