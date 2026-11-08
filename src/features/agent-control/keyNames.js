// Key names for `lirah tabs keys` -> the bytes a terminal sends for them.
// `appCursor`: the program switched arrows to application mode (ESC O A).

const NAMED = {
  enter: '\r', return: '\r', esc: '\x1b', escape: '\x1b', tab: '\t', 'shift+tab': '\x1b[Z',
  space: ' ', backspace: '\x7f', delete: '\x1b[3~', home: '\x1b[H', end: '\x1b[F',
  pageup: '\x1b[5~', pagedown: '\x1b[6~',
};
const ARROWS = { up: 'A', down: 'B', right: 'C', left: 'D' };

export const KEY_NAMES = [...Object.keys(NAMED), ...Object.keys(ARROWS), 'ctrl+<letter>', 'one character'];

export function keyBytes(name, { appCursor = false } = {}) {
  const key = String(name);
  const lower = key.toLowerCase();
  if (Object.hasOwn(NAMED, lower)) return NAMED[lower];
  if (Object.hasOwn(ARROWS, lower)) return `\x1b${appCursor ? 'O' : '['}${ARROWS[lower]}`;
  const ctrl = /^ctrl\+([a-z])$/.exec(lower);
  if (ctrl) return String.fromCharCode(ctrl[1].charCodeAt(0) - 96);
  // One character as typed (y, n, 1); longer text goes through `tabs send`.
  if ([...key].length === 1) return key;
  throw new Error(`unknown key "${key}"; use ${KEY_NAMES.join(', ')} (text goes through \`lirah tabs send\`)`);
}
