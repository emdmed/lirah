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
import { LIVE, OWN_BUSY, YOUR_TURN, remoteLabel, remoteWork, tabActivity, turnSummary } from './tabActivity';
import { getTabPrompt } from './tabPrompts';
import { linkRepo, unlinkRepo, useLinkedRepos } from './useLinkedRepos';
import { useDragReorder } from './useDragReorder';
import { ROW_KEYS, TabRow } from './TabRow';
import { useTabPlans } from '../plans/useTabPlans';
import { PlanRow } from '../plans/PlanRow';
import { isSettledPlan } from '../plans/TabPlanTier';
import { FrameHints } from '../../components/instrument/FrameHints';
import { requestPlanFocus, requestPlansPane } from '../plans/plansPaneEvents';

const ROW = '[data-tab-row]';

// j/k (or the arrows, Home, End) step between rows while one has focus.
function onListKey(e) {
  if (!e.target.matches?.(ROW) || e.ctrlKey || e.metaKey || e.altKey) return;
  const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[e.key];
  if (!step && e.key !== 'Home' && e.key !== 'End') return;
  const rows = [...e.currentTarget.querySelectorAll(ROW)];
  const i = rows.indexOf(e.target);
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + step));
  e.preventDefault();
  rows[j]?.focus();
  rows[j]?.scrollIntoView({ block: 'nearest' });
}

// The pane's closing line: how many tabs are live and how many need you.
function tally(kinds) {
  const live = kinds.filter((k) => OWN_BUSY.has(k) || k === 'remote').length;
  const yours = kinds.filter((k) => YOUR_TURN.has(k)).length;
  const resting = kinds.length - live - yours;
  return [
    live > 0 && { n: live, label: 'live', className: 'text-[var(--ins-lamp)]' },
    yours > 0 && { n: yours, label: 'your turn', className: 'text-[var(--ins-ok)]' },
    resting > 0 && { n: resting, label: 'resting', className: 'text-muted-foreground' },
  ].filter(Boolean);
}

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
  const [roleMenuId, setRoleMenuId] = useState(null); // tab id whose role menu is open
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
    setRoleMenu: setRoleMenuId,
  }), [switchTab, openPlan, requestCloseTab, commitRename, cancelRename, toggleLink, copyBranch, attachEdits, toggleTrail]);

  const kinds = [];

  return (
    <div className="group/list flex flex-col" onKeyDown={onListKey}>
      {tabs.map((tab, index) => {
        const work = remote[tab.id];
        const workFrom = work && tabs.find((t) => t.id === work.fromTabId);
        const workLabel = workFrom && remoteLabel(work, tabName(workFrom));
        const own = tabActivity(tab.id, cli[tab.id], now);
        const active = tab.id === activeTabId;
        const turn = cli[tab.id] ? getLastTurn(getTabSession(tab.id)) : null;
        const summary = turnSummary(turn, now);
        const activity = workLabel && !OWN_BUSY.has(own.kind) ? { kind: 'remote', label: workLabel } : own;
        kinds.push(activity.kind);
        const tabPlans = plans.byTab[tab.id];
        const queuePos = active ? -1 : queue.findIndex((q) => q.tabId === tab.id);
        const trailOpen = !!summary && openTrail === tab.id;
        // Nothing live and not the tab you're on: one line is enough.
        const compact = !active && !LIVE.has(activity.kind) && queuePos < 0 && !trailOpen
          && renamingId !== tab.id && roleMenuId !== tab.id
          && !tabPlans?.some((p) => !isSettledPlan(p));
        return (
          <TabRow
            key={tab.id}
            tab={tab}
            index={index}
            name={tabName(tab)}
            info={repo[tab.id]}
            // The moon is the agent's context window: no agent, no moon.
            contextFill={cli[tab.id] ? getTabContextFill(tab.id) : null}
            activityKind={activity.kind}
            activityLabel={activity.label}
            activitySince={activity.since}
            workLabel={workLabel}
            active={active}
            linked={!active && linkedRepos.some((r) => r.path === tab.projectPath)}
            closable={closable}
            queuePos={queuePos}
            turn={turn}
            summaryText={summary?.text}
            summaryRunning={!!summary?.running}
            summaryStale={!!summary?.stale}
            trailOpen={trailOpen}
            plans={tabPlans}
            compact={compact}
            renaming={renamingId === tab.id}
            roleMenuOpen={roleMenuId === tab.id}
            drag={drag}
            actions={actions}
          />
        );
      })}

      {/* Closing line: the tally, then the row keys while the list has focus. */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-3 pt-2 pb-1 text-[11px] tabular-nums">
        <span className="flex items-center gap-1 group-focus-within/list:hidden">
          {tally(kinds).map((t, i) => (
            <span key={t.label} className="flex items-center gap-1">
              {i > 0 && <span className="ins-sep-star" aria-hidden="true" />}
              <span className={t.className}>{t.n}</span>
              <span className="text-muted-foreground">{t.label}</span>
            </span>
          ))}
        </span>
        <span className="hidden flex-wrap items-center gap-x-1 gap-y-1 text-muted-foreground group-focus-within/list:flex">
          <FrameHints hints={ROW_KEYS} />
        </span>
      </div>

      {/* The active repo's plans with work left that no tab is working on. */}
      {plans.loose.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-3 pt-3.5 pb-1.5 edge-b-engraved">
            <span className="engraved-label">plans</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{plans.loose.length}</span>
            <button
              onClick={() => requestPlansPane('open')}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
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
