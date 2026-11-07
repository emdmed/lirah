/**
 * The keys a focused row answers to right now, most telling first: `on` is the
 * e.key values, `keys` what the hint shows. Drives the row's key handler and
 * the pane's hint line, so neither lists a key the other ignores. Kept out of
 * TabRow so tests can import it without TabRow's window-only figure code.
 */
export function rowKeys({ active, closable, edited, plans, summary }) {
  return [
    edited && { keys: ['a'], on: ['a'], label: 'attach' },
    summary && edited && { keys: ['e'], on: ['e'], label: 'edits' },
    plans?.length > 0 && { keys: ['o'], on: ['o'], label: 'plan' },
    !active && { keys: ['l'], on: ['l'], label: 'link' },
    { keys: ['r'], on: ['r', 'F2'], label: 'rename' },
    closable && { keys: ['x'], on: ['x'], label: 'close' },
    { keys: ['t'], on: ['t'], label: 'role' },
    { keys: ['f'], on: ['f'], label: 'folder' },
  ].filter(Boolean);
}
