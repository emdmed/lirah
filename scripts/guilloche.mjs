// Guilloché tiles, all grown from the original waves (guilloche-dark.svg):
// lines 4px apart, bunching and parting over the tile, each swaying sin(x/80)
// by an amount that flips sign down the tile. node scripts/guilloche.mjs public/royal
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const TAU = 2 * Math.PI;
const line = (W, y) => 'M' + Array.from({ length: W / 4 + 1 }, (_, k) => `${k * 4} ${y(k * 4).toFixed(2)}`).join('L');
// The waves' own field: line i of n rests at 4i plus a slow bunching, and sways.
const rest = (i, n) => 4 * i + 3.2 * Math.sin((TAU * i) / n);
const sway = (i, n, x, period = 80) => 3.2 * Math.cos((TAU * i) / n) * Math.sin((TAU * x) / period);
const field = (W, n, y) => Array.from({ length: n }, (_, i) => line(W, (x) => y(i, x)));

// Each tile is a list of [d, k]: a path and its strength against the waves' faint ink.
const patterns = {
  // Swell: the waves riding a long roll that packs them into slanting bands.
  swell: { W: 480, H: 240, k: 1, paths: () => field(480, 60, (i, x) => rest(i, 60) + sway(i, 30, x) + 9 * Math.sin(TAU * (x / 480 + 2 * i / 60))) },
  // Current: irregular drift, a few slow waves summed, so neighbours move together and never cross.
  current: { W: 480, H: 240, k: 1, paths: () => field(480, 60, (i, x) => rest(i, 60)
    + 6 * Math.sin(TAU * (x / 480 + i / 60))
    + 5 * Math.sin(TAU * (2 * x / 480 - 2 * i / 60) + 1.3)
    + 3 * Math.sin(TAU * (3 * x / 480 + 3 * i / 60) + 2.1)) },
  // Moiré: the waves, and a second set at a slightly longer period between them.
  moire: { W: 480, H: 120, k: 0.65, paths: () => [
    ...field(480, 30, (i, x) => rest(i, 30) + sway(i, 30, x)),
    ...field(480, 30, (i, x) => rest(i, 30) + 2 + sway(i + 7, 30, x, 96)),
  ] },
};

// Scenes: a landscape along the foot of the panel (repeat-x), drawn twice as
// strong as the field, its lines packing tight at the ridge.
const ridgeLines = (W, H, n, top) => Array.from({ length: n }, (_, i) => {
  const t = i / (n - 1);
  return line(W, (x) => H - (H - top(x)) * (1 - (1 - t) ** 1.7) + 1.2 * (1 - t) * Math.sin((TAU * x) / 80 + i));
});
// A line broken wherever it dips under `floor`, so a far range stops behind the near one.
const above = (W, y, floor) => {
  let d = '';
  let pen = false;
  for (let x = 0; x <= W; x += 4) {
    const v = y(x);
    if (v < floor(x) - 3) { d += `${pen ? 'L' : 'M'}${x} ${v.toFixed(2)}`; pen = true; } else pen = false;
  }
  return d;
};
const tri = (x, p, ph) => 1 - 2 * Math.abs((((x / p + ph) % 1) + 1) % 1 - 0.5);
const dune = (x) => 0.75 * Math.max(0, Math.sin((TAU * x) / 720)) ** 2 + 0.35 * Math.max(0, Math.sin((TAU * x) / 360 + 2.2)) ** 3;
const range = (x, ph) => 0.6 * tri(x, 720, ph) ** 1.6 + 0.3 * tri(x, 240, ph * 3 + 0.3) ** 1.3 + 0.08 * tri(x, 80, ph * 7 + 0.1);

const scenes = {
  dunes: { W: 720, H: 140, k: 2, paths: () => ridgeLines(720, 140, 24, (x) => 118 - 112 * dune(x)) },
  // Peaks: a sharp range, and a fainter one behind it showing only above its ridge.
  peaks: { W: 720, H: 160, k: 2, paths: () => {
    const near = (x) => 156 - 110 * range(x, 0);
    const far = (x) => 120 - 100 * range(x, 0.43);
    // The far range's lines run from its ridge down to the foot, like the near one's, but faint and hidden behind it.
    const farLines = Array.from({ length: 22 }, (_, i) => {
      const t = i / 21;
      return [above(720, (x) => 160 - (160 - far(x)) * (1 - (1 - t) ** 1.7), near), 0.45];
    });
    return [...farLines, ...ridgeLines(720, 160, 26, near)];
  } },
  // Sea: lines crowding toward the horizon, swaying more the nearer they are.
  sea: { W: 240, H: 110, k: 2, paths: () => Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    return line(240, (x) => 3 + 105 * t ** 1.8 + (0.2 + 3 * t ** 1.5) * Math.sin((TAU * x) / 80 + i * 1.7));
  }) },
};

const write = (name, W, H, body) => {
  for (const [mode, ink, o] of [['dark', '#fffaeb', 0.06], ['light', '#1a1408', 0.07]]) {
    writeFileSync(`${out}/guilloche-${name}-${mode}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><g fill="none" stroke="${ink}" stroke-width=".7">${body(o)}</g></svg>`);
  }
};
for (const [name, p] of Object.entries({ ...patterns, ...scenes })) {
  const paths = p.paths().map((s) => (Array.isArray(s) ? s : [s, 1]));
  write(name in scenes ? `scene-${name}` : name, p.W, p.H, (o) => paths.map(([d, k]) => `<path d="${d}" stroke-opacity="${(o * p.k * k).toFixed(3)}"/>`).join(''));
}
