import { useRepoRoot } from '../plans/planRepoRoot';

/**
 * The project task list for `projectPath`: keyed by its repo root, so every
 * folder of a repo shares one list, or by the folder itself outside git.
 * `scope` is null until the repo lookup is done; `isRepo` says whether its
 * plans can go to the plans pane, which needs git.
 */
export function useProjectScope(projectPath) {
  const { repoRoot, checked } = useRepoRoot(projectPath);
  if (!projectPath || !checked) return { scope: null, isRepo: false };
  return { scope: repoRoot || projectPath, isRepo: !!repoRoot };
}
