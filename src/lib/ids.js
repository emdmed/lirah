/** A short random id, e.g. shortId('p') → 'p4k9x2a'. */
export function shortId(prefix) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

/** FNV-1a, as 8 hex chars. Enough to key a repo path or spot an edited file. */
export function hash8(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
