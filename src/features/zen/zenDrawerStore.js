import { useSyncExternalStore } from 'react';

// The one Zen drawer open, if any: { id, anchor } where anchor is the ZenLine
// segment it rises from. Module-level so the key handlers can open drawers too.
let open = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function getOpenDrawer() {
  return open;
}

export function openDrawer(id, anchor) {
  open = { id, anchor };
  emit();
}

export function closeDrawer(id) {
  if (!open || (id && open.id !== id)) return;
  open = null;
  emit();
}

/** Opens drawer `id` from its ZenLine segment (data-zen-segment), or closes it if open. */
export function toggleDrawer(id) {
  if (open?.id === id) return closeDrawer(id);
  openDrawer(id, document.querySelector(`[data-zen-segment="${id}"]`));
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useOpenDrawer() {
  return useSyncExternalStore(subscribe, getOpenDrawer);
}
