import { useCallback, useEffect, useState } from 'react';
import { uncommittedFiles } from './planGitOps';

/**
 * The plan's uncommitted files while `enabled` (a chunk is stuck without a
 * commit), so the panel can say whether to commit or mark it done. Read again
 * when `key` changes and when the window regains focus. `files` is null while
 * unknown (loading, or git failed).
 */
export function useUncommitted(plan, enabled, key) {
  const [files, setFiles] = useState(null);
  const [seq, setSeq] = useState(0);
  const refresh = useCallback(() => setSeq((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setFiles(null);
      return undefined;
    }
    let live = true;
    uncommittedFiles(plan)
      .then((f) => live && setFiles(f))
      .catch(() => live && setFiles(null));
    return () => {
      live = false;
    };
    // The plan object changes on every store write; its repos are what matter.
  }, [enabled, key, seq, plan.id]);

  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [enabled, refresh]);

  return { files, refresh };
}
