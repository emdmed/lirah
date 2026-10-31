import { useEffect, useMemo, useState } from 'react';
import { gitLines } from '../../lib/git';
import { CHUNK_STATUS } from './planModel';
import { chunkCommitsByRepo } from './planGit';

// sha -> Promise<string[]> of the files that commit touched. Commits never
// change, so this lives for the whole session; holding the promise (not the
// result) means two callers asking at once still run git once.
const filesBySha = new Map();

/** Files touched by one commit, repo-relative. Cached by sha; a failed call is dropped so it can retry. */
export function commitFiles(root, sha) {
  let pending = filesBySha.get(sha);
  if (!pending) {
    pending = gitLines(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).catch(() => {
      filesBySha.delete(sha);
      return [];
    });
    filesBySha.set(sha, pending);
  }
  return pending;
}

/** [{ id, repos: [[root, shas]] }] for implemented chunks that have commits. */
function committedChunks(plan) {
  if (!plan?.chunks) return [];
  return plan.chunks
    .filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED)
    .map((c) => ({ id: c.id, repos: Object.entries(chunkCommitsByRepo(plan, c)).filter(([, shas]) => shas?.length) }))
    .filter((c) => c.repos.length > 0);
}

/**
 * Files each implemented chunk touched: the union of `git diff-tree` over the
 * chunk's commits in every repo. Loads only while `enabled`, so callers can
 * wait until the figure is actually shown.
 * Returns { byChunk: { [chunkId]: string[] (sorted, repo-relative) }, byRepo, loading };
 * byRepo is { [chunkId]: { [root]: string[] } } for callers that must tell repos apart.
 */
export function usePlanCommitFiles(plan, enabled = true) {
  const chunks = useMemo(() => committedChunks(plan), [plan]);
  // Refetch only when the commits change, not on every plan update.
  const key = chunks.map((c) => `${c.id}=${c.repos.map(([r, s]) => `${r}:${s.join(',')}`).join(';')}`).join('|');
  const [state, setState] = useState({ key: null, byChunk: {}, byRepo: {} });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        chunks.map(async (c) => {
          const perRepo = await Promise.all(
            c.repos.map(async ([root, shas]) => {
              const lists = await Promise.all(shas.map((sha) => commitFiles(root, sha)));
              return [root, [...new Set(lists.flat())].sort()];
            })
          );
          return [c.id, perRepo];
        })
      );
      if (cancelled) return;
      const byChunk = {};
      const byRepo = {};
      for (const [id, perRepo] of entries) {
        byChunk[id] = [...new Set(perRepo.flatMap(([, files]) => files))].sort();
        byRepo[id] = Object.fromEntries(perRepo);
      }
      setState({ key, byChunk, byRepo });
    })();
    return () => {
      cancelled = true;
    };
    // `chunks` is fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  return { byChunk: state.byChunk, byRepo: state.byRepo, loading: enabled && state.key !== key };
}
