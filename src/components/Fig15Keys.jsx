import { Figure, Glow, INK, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { useModifierHold } from '../hooks/useModifierHold';
import { boundKeysFor, compactKeys } from '../lib/shortcuts';

// FIG.15: the keyboard under a held modifier. Every bound key is outlined,
// with its hint-bar number in the corner and a matching legend line, so the
// plate is read straight from SHORTCUTS and can't drift from it. Compact is
// the plate alone at half size: bound keys outlined in ink, the held
// modifiers lit, no faces, numbers or legend.

// Keycap geometry: 24-unit caps on a 27 pitch; each row is offset from the
// left edge like a real board.
const KW = 24;
const ST = 27;
const OX = 8;
const OY = 34;
const ROWS = [
  { o: 0, k: '`1234567890-=' },
  { o: 12, k: 'QWERTYUIOP[]' },
  { o: 18, k: "ASDFGHJKL;'" },
  { o: 30, k: 'ZXCVBNM,./' },
];
const MY = OY + ROWS.length * ST; // modifier row
const SPACE = { x: OX + 76, w: 190 };
const LX = 374; // legend column
const LINE = 18;
const W = 520;

// Compact: the plate at half size, with strokes kept at their full weight.
const C_SCALE = 0.5;
export const FIG15_COMPACT_VIEWBOX = `${OX * C_SCALE - 1} ${OY * C_SCALE - 1} ${(13 * ST - 3) * C_SCALE + 2} ${(MY + KW - OY) * C_SCALE + 2}`;
const NS = { vectorEffect: 'non-scaling-stroke' };

// Registry key names that live on a cap with a different face.
const ALIAS = { ':': ';' };

// The caps a registry key lights: one char, a range like '1-9', or Space.
// Anything else (Enter, Tab, arrows, F-keys) gets a legend line only.
function capsFor(key) {
  if (key === 'Space') return ['Space'];
  const range = /^(.)-(.)$/.exec(key);
  if (range) {
    const out = [];
    for (let c = range[1].charCodeAt(0); c <= range[2].charCodeAt(0); c++) out.push(String.fromCharCode(c));
    return out;
  }
  const k = ALIAS[key] ?? key;
  return k.length === 1 ? [k.toUpperCase()] : [];
}

// cap face → { n, mark } for the keys bound under `mod`. A range (1-9)
// outlines every cap but numbers only its first, so the ordinal doesn't read
// as another digit.
export function plateFor(mod) {
  const bound = boundKeysFor(mod);
  const lit = new Map();
  for (const b of bound) {
    capsFor(b.key).forEach((c, i) => {
      if (!lit.has(c)) lit.set(c, { n: b.n, mark: i === 0 });
    });
  }
  return { bound, lit };
}

function Cap({ x, y, w = KW, face, hit, bare = false }) {
  const on = hit != null;
  const n = hit?.mark && !bare ? hit.n : null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={KW}
        style={{ fill: on ? INK.paper : 'none', stroke: on ? INK.fg : INK.edge, strokeWidth: on ? STROKE.ink : STROKE.hair, ...(bare && NS) }}
      />
      {face && !bare && <T x={x + 4} y={y + 12} color={on ? INK.fg : INK.faint}>{face}</T>}
      {n != null && <T x={x + w - 3} y={y + KW - 3} anchor="end" color={INK.lamp}>{n}</T>}
    </g>
  );
}

function ModCap({ x, y = MY, w, face, held, bare = false }) {
  const rect = (
    <rect
      x={x}
      y={y}
      width={w}
      height={KW}
      style={{ fill: 'none', stroke: held ? INK.lamp : INK.edge, strokeWidth: held ? STROKE.ink : STROKE.hair, ...(bare && NS) }}
    />
  );
  return (
    <g>
      {held ? <Glow>{rect}</Glow> : rect}
      {!bare && <T x={x + 5} y={y + 15} color={held ? INK.lamp : INK.faint}>{face}</T>}
    </g>
  );
}

export function Fig15Drawing({ mod = 'ctrl' }) {
  const compact = useFigureCompact();
  const shift = mod === 'ctrl+shift';
  const { bound, lit } = plateFor(mod);
  const prefix = shift ? ['Ctrl', 'Shift'] : ['Ctrl'];
  const legend = bound.map((b) => ({ ...b, chord: compactKeys([...prefix, b.key]).join('') }));
  const keyW = Math.max(0, ...legend.map((l) => textWidth(l.chord)));
  const chordX = LX + Math.max(14, textWidth(legend.length) + 8);
  const labelX = chordX + keyW + 8;

  const plateBottom = MY + KW;
  const legendBottom = OY + 12 + Math.max(0, legend.length - 1) * LINE;
  const footY = Math.max(plateBottom, legendBottom) + 22;

  const plate = (
    <>
      {ROWS.map((r, ri) =>
        [...r.k].map((ch, i) => (
          <Cap key={ch} x={OX + r.o + i * ST} y={OY + ri * ST} face={ch} hit={lit.get(ch)} bare={compact} />
        )),
      )}
      {/* Left Shift sits in row 4's offset, before Z. */}
      <ModCap x={OX} y={OY + 3 * ST} w={27} face="⇧" held={shift} bare={compact} />
      <ModCap x={OX} w={40} face="ctrl" held bare={compact} />
      <ModCap x={OX + 43} w={30} face="alt" held={false} bare={compact} />
      <Cap x={SPACE.x} y={MY} w={SPACE.w} hit={lit.get('Space')} bare={compact} />
    </>
  );
  if (compact) return <g transform={`scale(${C_SCALE})`}>{plate}</g>;

  return (
    <g>
      {plate}

      <line x1={LX - 12} x2={LX - 12} y1={OY} y2={Math.max(plateBottom, legendBottom + 6)} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
      {legend.map((l, i) => {
        const y = OY + 12 + i * LINE;
        return (
          <g key={l.n}>
            <T x={LX} y={y} color={INK.lamp}>{l.n}</T>
            <T x={chordX} y={y} color={INK.fg}>{l.chord}</T>
            <T x={labelX} y={y}>{l.label}</T>
          </g>
        );
      })}
      <T x={W} y={footY} anchor="end" color={INK.faint}>from src/lib/shortcuts.js</T>
    </g>
  );
}

// Height of the plate for a modifier, so the viewBox fits the legend.
function heightFor(mod) {
  const n = boundKeysFor(mod).length;
  return Math.max(MY + KW, OY + 12 + Math.max(0, n - 1) * LINE) + 30;
}

// Shown at the top of the help dialog. Ctrl by default; holding Ctrl+Shift
// redraws it for that chord. No fallback: the list below says it all too.
export function Fig15Keys() {
  const { held } = useModifierHold();
  const mod = held === 'ctrl+shift' ? 'ctrl+shift' : 'ctrl';
  const n = boundKeysFor(mod).length;
  const chord = mod === 'ctrl+shift' ? '^⇧' : '^';
  const label = `Keyboard with ${mod === 'ctrl+shift' ? 'Ctrl+Shift' : 'Ctrl'} held, ${n} keys bound: ${boundKeysFor(mod)
    .map((b) => `${b.key} ${b.label}`)
    .join(', ')}.`;
  return (
    <Figure fig="keys" title={`HOLD ${chord} · ${n} BOUND`} viewBox={`0 0 ${W} ${heightFor(mod)}`} compactViewBox={FIG15_COMPACT_VIEWBOX} compactMinWidth={120} label={label} paper="var(--ins-panel)">
      <Fig15Drawing mod={mod} />
    </Figure>
  );
}
