import { Fragment } from 'react';
import { Keycap } from './Keycap';

// Join a shortcut's keys for one keycap: symbols run together (`^⇧D`), a word
// keeps a space from its neighbour (`alt M`) so it can't read as one word.
export function joinKeys(keys) {
  return keys.reduce((out, k, i) => {
    const prev = keys[i - 1];
    const gap = i > 0 && (k.length > 1 || prev.length > 1) ? ' ' : '';
    return out + gap + k;
  }, '');
}

// One key hint: `↑ ↓ move`.
export function FrameHint({ keys, label }) {
  return (
    <span className="tui-frame-hint">
      {keys.map((k, i) => <Keycap key={i} size="sm">{k}</Keycap>)}
      {label && <span>{label}</span>}
    </span>
  );
}

// Key hints for a frame's bottom line, separated by faint stars:
// `↑ ↓ move ✦ ↵ open ✦ esc close`. `hints` is [{ keys, label }]; children
// (a dialog's clickable esc cap) come last, after one more star.
export function FrameHints({ hints = [], children }) {
  return (
    <>
      {hints.map((h, i) => (
        <Fragment key={h.label ?? i}>
          {i > 0 && <span className="ins-sep-star" aria-hidden="true" />}
          <FrameHint keys={h.keys} label={h.label} />
        </Fragment>
      ))}
      {children && hints.length > 0 && <span className="ins-sep-star" aria-hidden="true" />}
      {children}
    </>
  );
}
