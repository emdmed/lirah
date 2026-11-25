import { fallbackTitle } from './changesPrompt';

/**
 * useChanges' features → markdown notes: a heading per feature, its summary,
 * then a bullet per change with the version that shipped it (or "no commit").
 */
export function changesNotes(features, titles = {}) {
  return features
    .map((f) => {
      const bullets = f.changes.map((c) => {
        const tag = c.version ? ` (${c.version})` : c.noCommit ? ' (no commit)' : '';
        return `- ${titles[c.id] ?? fallbackTitle(c)}${tag}`;
      });
      return [`## ${f.name}`, ...(f.summary ? ['', f.summary] : []), '', ...bullets].join('\n');
    })
    .join('\n\n');
}
