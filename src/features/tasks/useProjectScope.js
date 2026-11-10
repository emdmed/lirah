import { useRepoRoot } from '../plans/planRepoRoot';

/**
 * The project task list for `projectPath`: keyed by its repo root, so every
 * folder of a repo shares one list, or by the folder itself outside git.
 * `scope` is null until the lookup is done.
 */
export function useProjectScope(projectPath) {
  const { repoRoot, checked } = useRepoRoot(projectPath);
  return { scope: projectPath && checked ? repoRoot : null };
}
