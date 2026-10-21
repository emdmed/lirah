import { useCallback, useMemo, useState } from 'react';
import { plural } from '../../lib/plural';
import { useBookmarks } from '../bookmarks';
import { useToast } from '../toast';
import { tabDisplayName, useTabManager } from './TabContext';
import { useTabsSummary } from './useTabsSummary';
import { getTabSession } from './terminalActivity';
import { getLastTurn } from './agentHookState';
import { useAttentionQueue } from './useAgentAttention';
import { OWN_BUSY, remoteLabel, remoteWork, tabActivity, turnSummary } from './tabActivity';
import { getTabPrompt } from './tabPrompts';
import { linkRepo, unlinkRepo, useLinkedRepos } from './useLinkedRepos';
import { useDragReorder } from './useDragReorder';
import { TabRow } from './TabRow';

export function TabsSummaryPane() {
  const { tabs, activeTabId, switchTab, requestCloseTab, reorderTab, renameTab } = useTabManager();
  const closable = tabs.length > 1;
  const { repo, cli, now } = useTabsSummary(tabs);
  const { bookmarks } = useBookmarks();
  const toast = useToast();
  const { linkedRepos } = useLinkedRepos(activeTabId);
  const tabName = (tab) => tabDisplayName(tab, bookmarks);
  const remote = remoteWork(tabs, cli, now);
  const queue = useAttentionQueue(tabs);
  const [openTrail, setOpenTrail] = useState(null); // tab id whose last turn is expanded
  const [renamingId, setRenamingId] = useState(null);
  const drag = useDragReorder(reorderTab);

  const commitRename = useCallback((tab, value) => {
    const name = value.trim();
    const automatic = tabDisplayName({ ...tab, customLabel: undefined }, bookmarks);
    renameTab(tab.id, name === automatic ? '' : name);
    setRenamingId(null);
  }, [bookmarks, renameTab]);
  const cancelRename = useCallback(() => setRenamingId(null), []);

  const copyBranch = useCallback(async (branch) => {
    try {
      await navigator.clipboard.writeText(branch);
      toast.success(`Copied ${branch}`);
    } catch {
      toast.error('Could not copy branch name');
    }
  }, [toast]);

  // Toggles another tab's repo in the active tab's prompt, so the agent knows
  // the feature spans more than one repo.
  const toggleLink = useCallback((tab, name, linked) => {
    if (linked) {
      unlinkRepo(activeTabId, tab.projectPath);
      return;
    }
    linkRepo(activeTabId, { path: tab.projectPath, name, role: tab.role });
    getTabPrompt(activeTabId)?.open();
  }, [activeTabId]);

  // Puts the files another (or this) tab's agent edited last turn into the
  // current prompt, e.g. to have a second agent review them.
  const attachEdits = useCallback((files) => {
    const prompt = getTabPrompt(activeTabId);
    if (!prompt?.addFiles) return;
    prompt.addFiles(files);
    prompt.open();
    toast.success(`Attached ${plural(files.length, 'file')} to the prompt`);
  }, [activeTabId, toast]);

  const actions = useMemo(() => ({
    switchTab,
    closeTab: requestCloseTab,
    startRename: setRenamingId,
    commitRename,
    cancelRename,
    toggleLink,
    copyBranch,
    attachEdits,
    toggleTrail: (id) => setOpenTrail((open) => (open === id ? null : id)),
  }), [switchTab, requestCloseTab, commitRename, cancelRename, toggleLink, copyBranch, attachEdits]);

  return (
    <div className="flex flex-col">
      {tabs.map((tab, index) => {
        const work = remote[tab.id];
        const workFrom = work && tabs.find((t) => t.id === work.fromTabId);
        const workLabel = workFrom && remoteLabel(work, tabName(workFrom));
        const own = tabActivity(tab.id, cli[tab.id], now);
        const active = tab.id === activeTabId;
        const turn = cli[tab.id] ? getLastTurn(getTabSession(tab.id)) : null;
        const summary = turnSummary(turn, now);
        return (
          <TabRow
            key={tab.id}
            tab={tab}
            index={index}
            name={tabName(tab)}
            info={repo[tab.id]}
            activity={workLabel && !OWN_BUSY.has(own.kind) ? { kind: 'remote', label: workLabel } : own}
            workLabel={workLabel}
            active={active}
            linked={!active && linkedRepos.some((r) => r.path === tab.projectPath)}
            closable={closable}
            queuePos={active ? -1 : queue.findIndex((q) => q.tabId === tab.id)}
            turn={turn}
            summary={summary}
            trailOpen={!!summary && openTrail === tab.id}
            renaming={renamingId === tab.id}
            drag={drag}
            actions={actions}
          />
        );
      })}
    </div>
  );
}
