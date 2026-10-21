import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createEmitter } from '../../lib/createStore';

// Repos linked into each tab's prompt, as { path, name, role }. Module state so
// the tabs summary pane can show and toggle the active tab's links, and the
// prompt can send them as a section instead of text in the textarea.

const EMPTY = [];
const byTab = new Map(); // tabId -> repos
const { subscribe, emit } = createEmitter();

function setRepos(tabId, repos) {
  if (repos.length) byTab.set(tabId, repos);
  else byTab.delete(tabId);
  emit();
}

export function getLinkedRepos(tabId) {
  return byTab.get(tabId) || EMPTY;
}

export function isRepoLinked(tabId, path) {
  return getLinkedRepos(tabId).some((r) => r.path === path);
}

export function linkRepo(tabId, repo) {
  if (isRepoLinked(tabId, repo.path)) return;
  setRepos(tabId, [...getLinkedRepos(tabId), repo]);
}

export function unlinkRepo(tabId, path) {
  setRepos(tabId, getLinkedRepos(tabId).filter((r) => r.path !== path));
}

export function clearLinkedRepos(tabId) {
  if (byTab.has(tabId)) setRepos(tabId, EMPTY);
}

// Keeps linked entries in step when a tab's repo is re-tagged.
export function setLinkedRepoRole(path, role) {
  for (const [tabId, repos] of byTab) {
    if (repos.some((r) => r.path === path)) {
      setRepos(tabId, repos.map((r) => (r.path === path ? { ...r, role } : r)));
    }
  }
}

export function useLinkedRepos(tabId) {
  const getSnapshot = useCallback(() => getLinkedRepos(tabId), [tabId]);
  const linkedRepos = useSyncExternalStore(subscribe, getSnapshot);
  const unlink = useCallback((path) => unlinkRepo(tabId, path), [tabId]);
  const clear = useCallback(() => clearLinkedRepos(tabId), [tabId]);
  return useMemo(
    () => ({ linkedRepos, unlinkRepo: unlink, clearLinkedRepos: clear }),
    [linkedRepos, unlink, clear],
  );
}
