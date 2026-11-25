// The flags (⚠ F1: …) and assumptions (Assumed: …) of an agent's reply, in
// the reply format the voice prompt asks for. Kept on the work log's end line.

// A list bullet, and a whole line wrapped in bold or backticks, are not part of it.
function unwrap(line) {
  let s = line.trim().replace(/^[-*]\s+/, '');
  for (const m of ['**', '`']) if (s.length > 2 * m.length && s.startsWith(m) && s.endsWith(m)) s = s.slice(m.length, -m.length).trim();
  return s;
}

// Bold or backticks may also wrap just the prefix: **⚠ F1:** text.
const FLAG_RE = /^[*`]*⚠️?\s*(?:(F\d+)\b\s*:?)?[*`]*\s*(.+?)$/i;
const ASSUMED_RE = /^[*`]*Assumed:[*`]*\s*(.+?)$/i;

/** The ⚠ lines of a reply as [{ n: 'F1' | null, text }], in order, deduplicated. */
export function parseFlags(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = unwrap(line).match(FLAG_RE);
    const f = m && { n: m[1]?.toUpperCase() ?? null, text: m[2] };
    if (f && !out.some((o) => o.n === f.n && o.text === f.text)) out.push(f);
  }
  return out;
}

/** The `Assumed:` lines of a reply, without the prefix, in order, deduplicated. */
export function parseAssumptions(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const a = unwrap(line).match(ASSUMED_RE)?.[1];
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}
