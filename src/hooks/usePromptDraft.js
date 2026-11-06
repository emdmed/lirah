import { useEffect, useRef } from 'react';
import { saveDraft } from '../lib/promptDrafts';
import { linkRepo } from '../features/tabs/useLinkedRepos';

/**
 * Keeps the tab's draft (lib/promptDrafts) in step with its composer. The text
 * and files start from the draft through usePromptStore and FileSelectionProvider;
 * this links the draft's repos, extracts symbols for its files, then saves on change.
 */
export function usePromptDraft(tabId, draft, { promptStore, selectedFiles, fileStates, linkedRepos, isAnalyzable, extractFileSymbols }) {
  useEffect(() => {
    draft?.repos.forEach((repo) => linkRepo(tabId, repo));
    draft?.files.forEach(({ path }) => { if (isAnalyzable(path)) extractFileSymbols(path); });
    // Once, on boot: the draft is what the tab started with.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The first run holds the draft as loaded (repos still being linked): nothing to save.
  const started = useRef(false);
  useEffect(() => {
    const save = () => saveDraft(tabId, {
      text: promptStore.get(),
      files: [...selectedFiles].map((path) => ({ path, state: fileStates.get(path) || 'modify' })),
      repos: linkedRepos,
    });
    if (started.current) save();
    started.current = true;
    return promptStore.subscribe(save);
  }, [tabId, promptStore, selectedFiles, fileStates, linkedRepos]);
}
