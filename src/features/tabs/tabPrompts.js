// Each tab's prompt handle, so the tabs summary pane can reveal the active
// tab's prompt after linking a repo into it, or attach files to it.

const tabPrompts = new Map(); // tabId -> { open, addFiles }

export function registerTabPrompt(tabId, entry) {
  tabPrompts.set(tabId, entry);
  return () => {
    if (tabPrompts.get(tabId) === entry) tabPrompts.delete(tabId);
  };
}

export function getTabPrompt(tabId) {
  return tabPrompts.get(tabId) || null;
}
