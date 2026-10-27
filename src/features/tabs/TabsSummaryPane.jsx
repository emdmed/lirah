import { useCallback, useMemo, useState } from 'react';
import { plural } from '../../lib/plural';
import { useBookmarks } from '../bookmarks';
import { useToast } from '../toast';
import { tabDisplayName, useTabManager } from './TabContext';
import { useTabsSummary } from './useTabsSummary';
import { getTabSession } from './terminalActivity';
import { getTabContextFill } from './tabContextFill';
import { getLastTurn } from './agentHookState';
import { useAttentionQueue } from './useAgentAttention';
import { OWN_BUSY, remoteLabel, remoteWork, tabActivity, turnSummary } from './tabActivity';
import { getTabPrompt } from './tabPrompts';
import { linkRepo, unlinkRepo, useLinkedRepos } from './useLinkedRepos';
import { useDragReorder } from './useDragReorder';
import { TabRow } from './TabRow';
import { useTabPlans } from '../plans/useTabPlans';
import { PlanRow } from '../plans/PlanRow';
import { requestPlanFocus, requestPlansPane } from '../plans/plansPaneEvents';

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
  // useDragReorder hands back a new object each render; rows are memoized, so
  // keep it the same until one of its parts changes.
  const { dragIndex, onDragStart, onDragOver, onDrop, endDrag, dropLineAt } = useDragReorder(reorderTab);
  const drag = useMemo(
    () => ({ dragIndex, onDragStart, onDragOver, onDrop, endDrag, dropLineAt }),
    [dragIndex, onDragStart, onDragOver, onDrop, endDrag, dropLineAt],
  );
  const plans = useTabPlans(tabs, activeTabId);

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
    getTabPrompt(activeTabId)?.reveal();
  }, [activeTabId]);

  // Puts the files another (or this) tab's agent edited last turn into the
  // current prompt, e.g. to have a second agent review them.
  const attachEdits = useCallback((files) => {
    const prompt = getTabPrompt(activeTabId);
    if (!prompt?.addFiles) return;
    prompt.addFiles(files);
    prompt.reveal();
    toast.success(`Attached ${plural(files.length, 'file')} to the prompt`);
  }, [activeTabId, toast]);

  // A plan opens in the plans view, which shows the active tab's repo: its
  // tab comes forward first.
  const openPlan = useCallback((tabId, planId) => {
    if (tabId !== activeTabId) switchTab(tabId);
    requestPlanFocus(planId);
  }, [activeTabId, switchTab]);

  const toggleTrail = useCallback((id) => setOpenTrail((open) => (open === id ? null : id)), []);

  const actions = useMemo(() => ({
    switchTab,
    openPlan,
    closeTab: requestCloseTab,
    startRename: setRenamingId,
    commitRename,
    cancelRename,
    toggleLink,
    copyBranch,
    attachEdits,
    toggleTrail,
  }), [switchTab, openPlan, requestCloseTab, commitRename, cancelRename, toggleLink, copyBranch, attachEdits, toggleTrail]);

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
        const activity = workLabel && !OWN_BUSY.has(own.kind) ? { kind: 'remote', label: workLabel } : own;
        return (
          <TabRow
            key={tab.id}
            tab={tab}
            index={index}
            name={tabName(tab)}
            info={repo[tab.id]}
            contextFill={getTabContextFill(tab.id)}
            activityKind={activity.kind}
            activityLabel={activity.label}
            activitySince={activity.since}
            workLabel={workLabel}
            active={active}
            linked={!active && linkedRepos.some((r) => r.path === tab.projectPath)}
            closable={closable}
            queuePos={active ? -1 : queue.findIndex((q) => q.tabId === tab.id)}
            turn={turn}
            summaryText={summary?.text}
            summaryRunning={!!summary?.running}
            trailOpen={!!summary && openTrail === tab.id}
            plans={plans.byTab[tab.id]}
            renaming={renamingId === tab.id}
            drag={drag}
            actions={actions}
          />
        );
      })}

      {/* The active repo's plans with work left that no tab is working on. */}
      {plans.loose.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-3 pt-3.5 pb-1.5 edge-b-engraved">
            <span className="engraved-label">plans</span>
            <span className="font-mono text-[10px] tabular-nums text-faint">{plans.loose.length}</span>
            <button
              onClick={() => requestPlansPane('open')}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              title="Show every plan of this repo"
            >
              all plans
            </button>
          </div>
          {plans.loose.map((plan) => (
            <PlanRow key={plan.id} plan={plan} onOpen={() => requestPlanFocus(plan.id)} />
          ))}
        </>
      )}
    </div>
  );
}
