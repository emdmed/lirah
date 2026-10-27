// Each tab's prompt handle, so the tabs summary pane can reveal the active
// tab's prompt after linking a repo into it, or attach files to it, and so the
// plans pane can send a chunk straight to the tab's agent.

const tabPrompts = new Map(); // tabId -> { open, addFiles, send, clearContext }

export function registerTabPrompt(tabId, entry) {
  tabPrompts.set(tabId, entry);
  return () => {
    if (tabPrompts.get(tabId) === entry) tabPrompts.delete(tabId);
  };
}

export function getTabPrompt(tabId) {
  return tabPrompts.get(tabId) || null;
}
