import { createEmitter } from '../../lib/createStore';

// Recent PTY output per session as plain text, for `lirah tabs wait --output`.
// Kept only while a wait watches the session, so idle tabs pay one Map lookup
// per chunk. Offsets count characters since watching began.

const MAX_CHARS = 64 * 1024;
// CSI, OSC (BEL or ST terminated) and two-byte escapes.
// shortcut: an escape split across two chunks isn't stripped; fine for matching words.
const ANSI = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])/g;

const tails = new Map(); // sessionId -> { decoder, text, end, until }
const output = createEmitter();

// Start (or keep) watching for `ms` more; returns the offset output starts from now.
export function watchOutput(sessionId, ms) {
  let tail = tails.get(sessionId);
  if (!tail) tails.set(sessionId, (tail = { decoder: new TextDecoder(), text: '', end: 0 }));
  tail.until = Date.now() + ms;
  return tail.end;
}

export function feedOutput(sessionId, bytes) {
  const tail = tails.get(sessionId);
  if (!tail) return;
  if (Date.now() > tail.until) {
    tails.delete(sessionId);
    return;
  }
  const text = tail.decoder.decode(bytes, { stream: true }).replace(ANSI, '');
  if (!text) return;
  tail.text = (tail.text + text).slice(-MAX_CHARS);
  tail.end += text.length;
  output.emit(sessionId);
}

// Text printed since `from` (what's still kept of it).
export function outputSince(sessionId, from) {
  const tail = tails.get(sessionId);
  if (!tail) return '';
  return tail.text.slice(Math.max(0, from - (tail.end - tail.text.length)));
}

export function subscribeOutput(fn) {
  return output.subscribe(fn);
}
