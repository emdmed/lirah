// The Lirah mark: the Grenze Gotisch "L" engraved into a riveted plate.
// The outline is the font's own glyph (units per em 1000, y up), so the mark
// never depends on the webfont having loaded.
const GLYPH =
  'M203 559Q196 494 195.5 434.0Q195 374 196.5 320.0Q198 266 198 217Q198 186 191.5 166.5Q185 147 171.0 133.5Q157 120 135 107L137 101L442 84Q453 73 453 57L415 -14Q351 -6 304.0 0.0Q257 6 225.0 10.0Q193 14 173.0 15.5Q153 17 143 17Q129 17 107.0 14.0Q85 11 59.5 6.0Q34 1 9 -4L-2 3L6 64Q37 73 53.0 84.5Q69 96 75.0 115.5Q81 135 81 165Q81 185 79.0 214.0Q77 243 75.0 277.0Q73 311 70.5 344.5Q68 378 67.5 406.5Q67 435 68 454Q78 476 93.5 497.5Q109 519 130.0 540.5Q151 562 174 580ZM249 83V534Q249 544 256.0 567.5Q263 591 272 615L302 611V140Q302 134 296.0 118.5Q290 103 279 83ZM441 415H376L363 525Q353 528 339.0 531.5Q325 535 312.0 537.5Q299 540 288 540Q281 540 275.0 539.5Q269 539 264 538L272 615Q277 617 280.5 617.0Q284 617 288 617Q303 617 331.5 614.5Q360 612 392.5 609.0Q425 606 453 602Z';

// Glyph placement in the 64-unit box. At 24px and under the screws and bevel
// drop, the plate takes the legend colour so it reads in chrome rows, and the
// L grows to fill it. The glyph is centred on its ink bounds (x -2..453,
// y -14..617), not its baseline, so it sits optically centred on the plate.
const FULL = { scale: 0.058 };
const SMALL = { scale: 0.078 };
const GLYPH_CENTER_X = 225.5;
const GLYPH_CENTER_Y = 301.5;
const SCREWS = [[9, 9], [55, 9], [9, 55], [55, 55]];

function glyphTransform({ scale }, dy = 0) {
  return `translate(${32 - GLYPH_CENTER_X * scale} ${32 + GLYPH_CENTER_Y * scale + dy}) scale(${scale} ${-scale})`;
}

function Screw({ x, y, r = 2.7 }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} style={{ fill: 'color-mix(in srgb, var(--color-foreground) 30%, var(--ins-raised))', stroke: 'var(--ins-edge-strong)', strokeWidth: 0.8 }} />
      <path d={`M${x - r * 0.6} ${y + r * 0.6}L${x + r * 0.6} ${y - r * 0.6}`} style={{ stroke: 'var(--color-muted-foreground)', strokeWidth: 0.9 }} />
    </>
  );
}

export function LirahMark({ size = 48, title, className }) {
  const small = size <= 24;
  const fit = small ? SMALL : FULL;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {small ? (
        <>
          <rect x="3" y="3" width="58" height="58" style={{ fill: 'var(--ins-legend)' }} />
          <path d={GLYPH} transform={glyphTransform(fit)} style={{ fill: 'var(--ins-gutter)' }} />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="58" height="58" style={{ fill: 'var(--ins-plate)' }} />
          <rect x="3.6" y="3.6" width="56.8" height="56.8" style={{ fill: 'none', stroke: 'var(--ins-edge-strong)', strokeWidth: 1.2 }} />
          <path d="M4.5 4.6H59.5" style={{ stroke: 'var(--ins-plate-lip)', strokeWidth: 1 }} />
          {SCREWS.map(([x, y]) => <Screw key={`${x}-${y}`} x={x} y={y} />)}
          {/* The cut, with light catching its lower lip. */}
          <path d={GLYPH} transform={glyphTransform(fit, 1)} style={{ fill: 'var(--ins-plate-lip)' }} />
          <path d={GLYPH} transform={glyphTransform(fit)} style={{ fill: 'var(--ins-plate-cut)' }} />
        </>
      )}
    </svg>
  );
}

export function LirahLockup({ size = 48, wordmarkSize = 42, stacked = false, className }) {
  return (
    <div className={`flex items-center ${stacked ? 'flex-col gap-2.5' : 'gap-3'} ${className ?? ''}`}>
      <LirahMark size={size} />
      <span className="[font-family:'Grenze_Gotisch',serif] leading-none" style={{ fontSize: wordmarkSize }}>
        Lirah
      </span>
    </div>
  );
}
