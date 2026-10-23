import { useMemo, useSyncExternalStore } from 'react';
import {
  getFileActivity,
  getFileActivityVersion,
  strongerMark,
  subscribeFileActivity,
} from '../../features/tabs/agentHookState';

// What agents read or edited under `rootPath` this turn, from any terminal:
// `files` by path, and `folders` holding the strongest mark of anything
// inside them, open or closed. Marks only; the tree's open state is untouched.
export function useAgentFileActivity(rootPath) {
  const version = useSyncExternalStore(subscribeFileActivity, getFileActivityVersion);
  return useMemo(() => {
    const files = new Map();
    const folders = new Map();
    const root = rootPath?.replace(/\/+$/, '');
    if (!root) return { files, folders };
    for (const [path, mark] of getFileActivity()) {
      if (!path.startsWith(`${root}/`)) continue;
      files.set(path, mark);
      // A directory target (grep -r tests, hooks/*.sh) marks that folder too.
      folders.set(path, strongerMark(folders.get(path), mark));
      for (let dir = path.slice(0, path.lastIndexOf('/')); dir.length > root.length; dir = dir.slice(0, dir.lastIndexOf('/'))) {
        folders.set(dir, strongerMark(folders.get(dir), mark));
      }
    }
    return { files, folders };
  }, [version, rootPath]);
}

// One primitive per row, so TreeNode's shallow memo holds.
export function markKey(mark) {
  return mark ? `${mark.kind}${mark.live ? '-live' : ''}` : undefined;
}
