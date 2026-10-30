// Window events that let one part of the app ask another for something
// without sharing React state. Every lirah:* event name lives here.

export const APP_EVENTS = {
  // Open or toggle the right sidebar, optionally on a given tab. detail: { action, tab? }
  jobsPane: 'lirah:jobs-pane',
  // Open a plan in the plans pane.
  plansFocus: 'lirah:plans-focus',
  // Start or stop auto-pilot on the plan the plans pane shows.
  plansAutopilotToggle: 'lirah:plans-autopilot-toggle',
  // Act on the open plan's next chunk: 'next' opens it, 'implement' sends it.
  plansChunkCommand: 'lirah:plans-chunk-command',
  // Jump to the next tab whose agent is waiting on you.
  attentionJump: 'lirah:attention-jump',
};

export function emitAppEvent(name, detail) {
  window.dispatchEvent(detail === undefined ? new CustomEvent(name) : new CustomEvent(name, { detail }));
}

/** Listen for `name`; returns the unsubscribe function. */
export function onAppEvent(name, fn) {
  window.addEventListener(name, fn);
  return () => window.removeEventListener(name, fn);
}

/**
 * A request served by whoever listens for `name`.
 *
 * Fire-and-forget by default: request(detail) dispatches the event with that
 * detail. With `pending`, request(value) keeps the value (no detail is sent)
 * until the listener take()s it, for a listener that may not be mounted or
 * ready yet. A value older than `ttl` ms is dropped instead of taken.
 * `before` runs after the value is kept and before the event goes out.
 */
export function createRequest(name, { pending = false, ttl = Infinity, before } = {}) {
  let held = null;
  let heldAt = 0;
  return {
    request(value) {
      if (pending) {
        held = value ?? true;
        heldAt = Date.now();
      }
      before?.();
      emitAppEvent(name, pending ? undefined : value);
    },
    subscribe: (fn) => onAppEvent(name, fn),
    /** The pending value if `accept` takes it (and clears it), else null. */
    take(accept = () => true) {
      if (held === null) return null;
      if (Date.now() - heldAt >= ttl) {
        held = null;
        return null;
      }
      if (!accept(held)) return null;
      const value = held;
      held = null;
      return value;
    },
  };
}
