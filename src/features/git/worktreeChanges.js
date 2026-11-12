import { git, gitLines } from '../../lib/git';
import { joinPath, parentDir } from '../../utils/pathUtils';

/**
 * What the worktree at `path` changed since it split from `baseBranch`,
 * uncommitted and untracked work included: { baseRef, files: [{ path, status }] },
 * paths absolute and sorted folder by folder, the order ChangedFilesList shows them.
 */
export async function worktreeChanges(path, baseBranch) {
  const baseRef = (await git(path, ['merge-base', baseBranch, 'HEAD'])).trim();
  if (!baseRef) throw new Error(`No common commit with ${baseBranch}`);
  // quotePath off: names with non-ASCII characters come back as written.
  const [tracked, untracked] = await Promise.all([
    gitLines(path, ['-c', 'core.quotePath=false', 'diff', '--name-status', baseRef]),
    gitLines(path, ['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard']),
  ]);
  const rels = [
    ...tracked.map((l) => {
      const [status, ...names] = l.split('\t');
      return { rel: names.at(-1), status: status[0] };
    }),
    ...untracked.map((rel) => ({ rel, status: 'A' })),
  ];
  rels.sort((a, b) => parentDir(a.rel).localeCompare(parentDir(b.rel)) || a.rel.localeCompare(b.rel));
  return { baseRef, files: rels.map(({ rel, status }) => ({ path: joinPath(path, rel), status })) };
}
