// While a sidebar drag is under way, panes resize every frame. Expensive
// resize work (terminal refit, fitted figures) waits for the drag to pause.
const ATTR = 'data-pane-drag';
const SETTLE_MS = 100;

export function setPaneDrag(on) {
  document.body.toggleAttribute(ATTR, on);
}

/**
 * Wraps a resize handler: runs `fn` right away normally, and during a drag
 * only once resizing pauses for SETTLE_MS. Returns [run, cancel].
 */
export function paneDragAware(fn) {
  let timer = null;
  const cancel = () => clearTimeout(timer);
  const run = (...args) => {
    cancel();
    if (document.body.hasAttribute(ATTR)) timer = setTimeout(() => fn(...args), SETTLE_MS);
    else fn(...args);
  };
  return [run, cancel];
}
