import { createEmitter } from '../../lib/createStore';

// The line being typed in each terminal, rebuilt from its keystrokes so the
// context pane can show which features a prompt will name before it's sent.
// shortcut: keystrokes only; cursor moves, history recall and the CLI's own
// edits aren't seen, so the line can drift until Enter or Ctrl+C resets it.
const lines = new Map(); // sessionId -> text
const { subscribe, emit } = createEmitter();
export { subscribe as subscribeTypedLine };

export function getTypedLine(sessionId) {
  return lines.get(sessionId) || '';
}

/** Pure: the line after `data` (one onData chunk) is typed into it. */
export function applyKeys(line, data) {
  const text = data.replace(/\x1b\[20[01]~/g, ''); // bracketed paste markers
  if (text.startsWith('\x1b')) return line; // arrows, function keys, Alt+…
  for (const ch of text) {
    if (ch === '\r' || ch === '\x03' || ch === '\x15') line = '';
    else if (ch === '\x7f' || ch === '\b') line = line.slice(0, -1);
    else if (ch >= ' ' || ch === '\n') line += ch;
  }
  return line;
}

export function trackTyped(sessionId, data) {
  const prev = getTypedLine(sessionId);
  const next = applyKeys(prev, data);
  if (next === prev) return;
  if (next) lines.set(sessionId, next); else lines.delete(sessionId);
  emit();
}
