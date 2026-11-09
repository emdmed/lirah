// loopPlate: the auto-pilot loop as a compact strong-weight schematic (the
// loop recipe's strong marks on a 456×84 chamfered plate, where the kit's
// loop is a 420px circle). Four stations clockwise from the top: 1 on the
// top run, 2 on the right end, 3 on the bottom run, 4 on the left end. The
// edges are 2px mitred lines, faint ahead and ink once run, with a solid
// head on each straight; a skipped nudge's two edges are dashed. Each
// station is a 16px step chip: filled once done, a lamp outline while live,
// red where a run stopped. Only the station the run is at is named, with its
// clock. The lap reads on an inverted chip at the centre. Under the plate,
// the commit line: the run's newest commit (sha on an inverted chip, then
// its subject) on a leader to CHECK, which reads it; dashed while there is none.
//
// Data: { states: [4 × 'done'|'live'|'fault'|'todo'|'skip'], clock, centre,
//         commit: { sha, subject } | null, label }.
const C = window.Calibrated;
const { K } = C;
const R = C.recipes;

const W = 456;
const H = 84;
const NAMES = ['IMPLEMENT', 'CHECK', 'NUDGE', 'NEXT'];
// Edge i runs from station i to station i + 1, along the plate's centreline.
const EDGES = ['M176 12H326L336 22V32', 'M336 32V42L326 52H280', 'M280 52H130L120 42V32', 'M120 32V22L130 12H176'];
const AT = [[176, 12], [336, 32], [280, 52], [120, 32]];
// Heads sit on the straights (the corners and chips leave no run for them),
// clear of where the live name is set.
const HEADS = [[314, 12, 1], [306, 52, -1], [146, 52, -1], [154, 12, 1]];
const PAPER = 'var(--fig-paper)';
const BOLD = 'font-weight="600"';

const txt = (x, y, s, fill, anchor = 'start', extra = '') =>
  `<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" ${extra}>${C.esc(s)}</text>`;

function chip(x, y, n, state) {
  if (state === 'done' || state === 'fault') {
    const ink = state === 'done' ? 'var(--fg)' : 'var(--fault)';
    return `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" fill="${ink}"/>` + txt(x, y + 4, n, PAPER, 'middle', BOLD);
  }
  if (state === 'live') {
    return `<rect x="${x - 7.25}" y="${y - 7.25}" width="14.5" height="14.5" fill="${PAPER}" stroke="var(--live)" stroke-width="1.5"/>`
      + txt(x, y + 4, n, 'var(--live)', 'middle', BOLD);
  }
  const dash = state === 'skip' ? ' stroke-dasharray="2 2"' : '';
  return `<rect x="${x - 7.5}" y="${y - 7.5}" width="15" height="15" fill="${PAPER}" stroke="var(--edge-strong)"${dash}/>`
    + txt(x, y + 4, n, 'var(--muted)', 'middle');
}

function loopPlate(o) {
  const states = o.states;
  const at = states.findIndex((s) => s === 'live' || s === 'fault');
  const skip = states[2] === 'skip';
  const centreLine = 'stroke-dasharray="10 3 2 3"';
  let g = `<line x1="100" y1="32" x2="356" y2="32" stroke="var(--faint)" ${centreLine}/>`
    + `<line x1="228" y1="2" x2="228" y2="62" stroke="var(--faint)" ${centreLine}/>`;

  EDGES.forEach((d, i) => {
    const run = at >= 0 && i < at;
    const ink = run ? 'var(--fg)' : 'var(--edge-strong)';
    const dashed = skip && (i === 1 || i === 2);
    g += `<path d="${d}" fill="none" stroke="${ink}" stroke-width="2" stroke-linejoin="miter" stroke-linecap="${dashed ? 'butt' : 'square'}"${dashed ? ' stroke-dasharray="4 3"' : ''}/>`;
    const [x, y, dir] = HEADS[i];
    g += `<path d="M${x} ${y}L${x - dir * 8} ${y - 4}V${y + 4}Z" fill="${run ? 'var(--fg)' : 'var(--muted)'}"/>`;
  });

  const cw = C.textWidth(o.centre) + 14;
  g += `<rect x="${228 - cw / 2}" y="24" width="${cw}" height="16" fill="var(--fg)"/>` + txt(228, 36, o.centre, PAPER, 'middle', BOLD);
  AT.forEach(([x, y], i) => { g += chip(x, y, i + 1, states[i]); });

  // The one name on the drawing, knocked out of whatever line runs under it.
  if (at >= 0) {
    const name = NAMES[at] + (o.clock ? ` ${o.clock}` : '');
    const ink = states[at] === 'fault' ? 'var(--fault)' : 'var(--live)';
    const [x, y, anchor] = [[190, 16, 'start'], [350, 36, 'start'], [266, 56, 'end'], [106, 36, 'end']][at];
    const w = C.textWidth(name) + 8;
    const x0 = anchor === 'end' ? x - w + 4 : x - 4;
    g += `<rect x="${x0}" y="${y - 10}" width="${w}" height="13" fill="${PAPER}"/>` + txt(x, y, name, ink, anchor, `${BOLD} letter-spacing="0.4"`);
  }

  // The commit line, ending on a leader up to CHECK's side.
  const y = 78;
  const elbow = 'H346V52';
  if (o.commit) {
    const sw = C.textWidth(o.commit.sha) + 12;
    let subject = o.commit.subject || '';
    while (subject.length > 1 && sw + 8 + C.textWidth(subject) > 330) subject = subject.slice(0, -2) + '…';
    const end = sw + 14 + C.textWidth(subject);
    g += `<rect x="0" y="${y - 12}" width="${sw}" height="16" fill="var(--fg)"/>` + txt(6, y, o.commit.sha, PAPER, 'start', BOLD)
      + txt(sw + 8, y, subject, 'var(--muted)')
      + `<path d="M${end} ${y - 4}${elbow}" fill="none" stroke="var(--muted)" stroke-width="1.5"/>`
      + `<rect x="343" y="49" width="6" height="6" fill="${PAPER}" stroke="var(--muted)" stroke-width="1.5"/>`;
  } else {
    g += `<path d="M0 ${y - 4}${elbow}" fill="none" stroke="var(--edge-strong)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  }

  return { w: W, h: H, markup: g, label: o.label || 'Auto-pilot loop' };
}
loopPlate.extent = loopPlate.duration = () => 0;

R.loopPlate = loopPlate;
