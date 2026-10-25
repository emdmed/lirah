import { FILE_STATE_ORDER, FILE_STATE_LABELS } from "./FileStateSelector";

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Selected files as one line, by intent: `14 files: 12 edit · 2 read`.
 * A single intent reads `3 files: edit`. Empty when nothing is selected.
 */
export function summarizeFiles(selectedFiles, fileStates) {
  const total = selectedFiles?.size || 0;
  if (!total) return '';
  const counts = {};
  selectedFiles.forEach((path) => {
    const state = fileStates?.get(path) || 'modify';
    counts[state] = (counts[state] || 0) + 1;
  });
  const parts = FILE_STATE_ORDER
    .filter((state) => counts[state])
    .map((state) => {
      const label = FILE_STATE_LABELS[state].toLowerCase();
      return counts[state] === total ? label : `${counts[state]} ${label}`;
    });
  return `${plural(total, 'file')}: ${parts.join(' · ')}`;
}

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
