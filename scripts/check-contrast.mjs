/**
 * Contrast checks for the Instrument TUI material across every theme.
 *
 * Re-derives the `--ins-*` tokens from src/index.css in JS (color-mix in
 * srgb is a straight per-channel interpolation of the gamma-encoded values)
 * and asserts legibility for each theme in src/themes/theme-config.js.
 *
 *   node scripts/check-contrast.mjs        (or: npm run check:contrast)
 *
 * Keep the mixes here in step with the `:root` / `[data-theme="light"]`
 * blocks in src/index.css.
 */
import { themes } from '../src/themes/theme-config.js';

let failures = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name} ${extra}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
};

// --- colour parsing -------------------------------------------------------

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function parse(c) {
  c = c.trim();
  let m;
  if ((m = c.match(/^#([0-9a-f]{3,8})$/i))) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  if ((m = c.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i))) {
    return hslToRgb(+m[1], +m[2], +m[3]);
  }
  if ((m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i))) {
    return [+m[1], +m[2], +m[3]];
  }
  throw new Error(`unparsed colour: ${c}`);
}

// color-mix(in srgb, a p%, b)
const mix = (a, p, b) => a.map((v, i) => v * p + b[i] * (1 - p));

// --- metrics --------------------------------------------------------------

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// CIELAB L*
const lightness = (c) => {
  const y = luminance(c);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
};

// --- tokens ---------------------------------------------------------------

const BLACK = [0, 0, 0];

function tokens(theme) {
  const bg = parse(theme.ui.background);
  const fg = parse(theme.ui.foreground);
  const light = theme.type === 'light';
  const t = theme.terminal;
  return {
    panel: bg,
    fg,
    muted: parse(theme.ui.mutedForeground),
    gutter: light ? mix(bg, 0.92, fg) : mix(bg, 0.78, BLACK),
    legend: light ? mix(fg, 0.92, bg) : mix(fg, 0.85, bg),
    lamp: parse(theme.ui.lamp ?? t.brightYellow),
    lampOff: mix(fg, 0.18, bg),
    ok: parse(theme.ui.ok ?? t.brightGreen),
    warn: parse(theme.ui.warn ?? t.brightYellow),
    fault: parse(theme.ui.fault ?? t.brightRed),
  };
}

// Mono-hue themes deliberately draw every ANSI colour in one hue, so status
// lamps can only differ by lightness there; the check still applies.
const MIN_STATUS_DL = 4;

for (const [key, theme] of Object.entries(themes)) {
  console.log(`\n${key} (${theme.type})`);
  const k = tokens(theme);
  const r = (n) => n.toFixed(2);
  check('foreground on panel >= 7:1', contrast(k.fg, k.panel) >= 7, r(contrast(k.fg, k.panel)));
  check('muted on panel >= 4.5:1', contrast(k.muted, k.panel) >= 4.5, r(contrast(k.muted, k.panel)));
  check('legend on gutter >= 4.5:1', contrast(k.legend, k.gutter) >= 4.5, r(contrast(k.legend, k.gutter)));
  const dl = Math.abs(lightness(k.lamp) - lightness(k.lampOff));
  check('lamp vs lamp-off dL >= 25', dl >= 25, r(dl));
  const L = { ok: lightness(k.ok), warn: lightness(k.warn), fault: lightness(k.fault) };
  const pairs = [['ok', 'warn'], ['ok', 'fault'], ['warn', 'fault']];
  const minDl = Math.min(...pairs.map(([a, b]) => Math.abs(L[a] - L[b])));
  check(`ok/warn/fault differ in lightness (dL >= ${MIN_STATUS_DL})`, minDl >= MIN_STATUS_DL, r(minDl));
}

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
