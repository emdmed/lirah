// Each tab's prompt handle, so the tabs summary pane can reveal the active
// tab's prompt after linking a repo into it, or attach files to it, and so the
// plans pane can send a chunk straight to the tab's agent, and so a finished
// plan's card can open the tab's merge dialog.

const tabPrompts = new Map(); // tabId -> { reveal, addFiles, send, clearContext, merge }

export function registerTabPrompt(tabId, entry) {
  tabPrompts.set(tabId, entry);
  return () => {
    if (tabPrompts.get(tabId) === entry) tabPrompts.delete(tabId);
  };
}

export function getTabPrompt(tabId) {
  return tabPrompts.get(tabId) || null;
}
