import { fallbackTitle } from './changesPrompt';
import { flagKey } from './reviewState';

/**
 * useChanges' features → markdown notes: a heading per feature, its summary,
 * then a bullet per change with the version that shipped it (or "no commit"),
 * then the feature's flags still open in `review` (reviewState's).
 */
export function changesNotes(features, titles = {}, review = {}) {
  return features
    .map((f) => {
      const bullets = f.changes.map((c) => {
        const tag = c.version ? ` (${c.version})` : c.noCommit ? ' (no commit)' : '';
        return `- ${titles[c.id] ?? fallbackTitle(c)}${tag}`;
      });
      const open = f.changes.flatMap((c) => c.flags ?? []).filter((x) => review[flagKey(x)] === 'open');
      const flags = open.length ? ['', 'Open flags:', ...open.map((x) => `- ${x.n ? `${x.n}: ` : ''}${x.text}`)] : [];
      return [`## ${f.name}`, ...(f.summary ? ['', f.summary] : []), '', ...bullets, ...flags].join('\n');
    })
    .join('\n\n');
}
