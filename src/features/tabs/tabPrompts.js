// Each tab's prompt opener, so the tabs summary pane can reveal the active
// tab's prompt after linking a repo into it.

const tabPrompts = new Map(); // tabId -> { open }

export function registerTabPrompt(tabId, entry) {
  tabPrompts.set(tabId, entry);
  return () => {
    if (tabPrompts.get(tabId) === entry) tabPrompts.delete(tabId);
  };
}

export function getTabPrompt(tabId) {
  return tabPrompts.get(tabId) || null;
}
