import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { repoTop } from '../../lib/git';
import { planWorktreeOwner } from './planGit';

// A tab inside a plan's worktrees shows the plans of the repo that owns them.
async function resolveRepoRoot(projectPath) {
  const home = await invoke('get_home_dir').catch(() => null);
  const owner = home ? await planWorktreeOwner(home, projectPath) : null;
  if (owner) return owner;
  return repoTop(projectPath);
}

/** The repo whose plans `projectPath` shows, and whether that was looked up yet. */
export function useRepoRoot(projectPath) {
  const [repoRoot, setRepoRoot] = useState(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setChecked(false);
    if (!projectPath) return;
    resolveRepoRoot(projectPath)
      .then((root) => !cancelled && setRepoRoot(root))
      .catch(() => !cancelled && setRepoRoot(null))
      .finally(() => !cancelled && setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [projectPath]);
  return { repoRoot, checked };
}

// Found roots, by folder. Misses aren't kept: the folder may become a repo.
const rootCache = new Map();

/** The repo root of each of `paths` (path -> root), once resolved; repos only. */
export function useRepoRoots(paths) {
  const key = [...new Set(paths.filter(Boolean))].sort().join('\n');
  const [roots, setRoots] = useState({});
  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split('\n') : [];
    Promise.all(list.map(async (path) => {
      if (!rootCache.has(path)) {
        const root = await resolveRepoRoot(path).catch(() => null);
        if (root) rootCache.set(path, root);
      }
      return [path, rootCache.get(path) ?? null];
    })).then((entries) => {
      if (cancelled) return;
      const next = Object.fromEntries(entries.filter(([, root]) => root));
      setRoots((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return roots;
}
