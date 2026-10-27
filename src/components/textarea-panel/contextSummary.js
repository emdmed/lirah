const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Everything the prompt carries, in a few words: `14 files + Bugfix + 2
 * patterns`. Kept when the hook uses the context, so the status can still
 * say what went after the selection resets.
 */
export function summarizeContext({ fileCount = 0, elementCount = 0, repoCount = 0, templateTitle, patternCount = 0 }) {
  const parts = [];
  if (fileCount) parts.push(plural(fileCount, 'file'));
  if (elementCount) parts.push(plural(elementCount, 'element'));
  if (repoCount) parts.push(plural(repoCount, 'repo'));
  if (templateTitle) parts.push(templateTitle);
  if (patternCount) parts.push(plural(patternCount, 'pattern'));
  return parts.join(' + ');
}
