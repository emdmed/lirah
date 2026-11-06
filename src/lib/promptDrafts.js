// A tab's unsent prompt (text, selected files, linked repos), kept in its
// workspace.json as drafts { tabId: { text, files: [{ path, state }], repos } }
// so it survives a restart. Sending clears what the composer clears; drafts of
// closed tabs are dropped when the workspace is saved.
import { getWorkspaceData, setWorkspaceData, workspaceOfTab } from './workspaceStore';

const KEY = 'drafts';
const isObj = (v) => v && typeof v === 'object';

/** The tab's draft, cleaned of anything malformed (the file is hand-editable), or null. */
export function getDraft(tabId) {
  const ws = workspaceOfTab(tabId);
  const raw = ws && getWorkspaceData(ws, KEY)[tabId];
  if (!isObj(raw)) return null;
  return {
    text: typeof raw.text === 'string' ? raw.text : '',
    files: (Array.isArray(raw.files) ? raw.files : [])
      .filter((f) => typeof f?.path === 'string')
      .map((f) => ({ path: f.path, state: typeof f.state === 'string' ? f.state : 'modify' })),
    repos: (Array.isArray(raw.repos) ? raw.repos : []).filter((r) => typeof r?.path === 'string'),
  };
}

/** Store the tab's draft; an empty one removes the entry. No-op for a tab that is gone. */
export function saveDraft(tabId, { text = '', files = [], repos = [] }) {
  const ws = workspaceOfTab(tabId);
  if (!ws) return;
  const { [tabId]: _, ...rest } = getWorkspaceData(ws, KEY);
  const empty = !text && !files.length && !repos.length;
  setWorkspaceData(ws, KEY, empty ? rest : { ...rest, [tabId]: { text, files, repos } });
}
