import { useCallback, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { plural } from '../../lib/plural';
import { useBookmarks } from '../bookmarks';
import { useToast } from '../toast';
import { tabDisplayName, useTabManager } from './TabContext';
import { useTabsSummary } from './useTabsSummary';
import { getTabSession } from './terminalActivity';
import { getTabContextFill } from './tabContextFill';
import { getTabAutoCommit } from './tabAutoCommit';
import { getLastTurn } from './agentHookState';
import { useAttentionQueue } from './useAgentAttention';
import { AUTOPILOT_STATUS, haltWord } from '../plans/planModel';
import { autopilotLamp } from '../plans/parts';
import { LIVE, OWN_BUSY, remoteLabel, remoteWork, tabActivity, turnSummary } from './tabActivity';
import { getTabPrompt } from './tabPrompts';
import { tally } from './tally';
import { linkRepo, unlinkRepo, useLinkedRepos } from './useLinkedRepos';
import { useDragReorder } from './useDragReorder';
import { ROW_KEYS, TabRow } from './TabRow';
import { rowKeys } from './rowKeys';
import { useTabPlans } from '../plans/useTabPlans';
import { PlanRow } from '../plans/PlanRow';
import { NewRow } from '../plans/parts';
import { FrameHints } from '../../components/instrument/FrameHints';
import { requestPlanFocus, requestPlansPane } from '../plans/plansPaneEvents';
import { EmptyPlate } from '@/components/EmptyState';

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

export function TabsSummaryPane({ onNewTab }) {
  const { tabs, workspaceTabs, activeTabId, switchTab, requestCloseTab, reorderTab, renameTab } = useTabManager();
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
  const [focusedId, setFocusedId] = useState(null); // tab id whose row has focus
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

  // Opens a tab's folder in the system file manager; the active tab stays put.
  const openFolder = useCallback(async (path) => {
    try {
      await invoke('open_in_file_manager', { path });
    } catch (e) {
      toast.error(String(e?.message ?? e));
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
    openFolder,
    attachEdits,
    toggleTrail,
    setRoleMenu: setRoleMenuId,
  }), [switchTab, openPlan, requestCloseTab, commitRename, cancelRename, toggleLink, copyBranch, openFolder, attachEdits, toggleTrail]);

  const kinds = [];
  let focusKeys = null;

  return (
    <div
      className="group/list flex flex-1 flex-col"
      onKeyDown={onListKey}
      onFocus={(e) => setFocusedId(e.target.matches?.(ROW) ? e.target.dataset.tabRow : null)}
      onBlur={() => setFocusedId(null)}
    >
      {workspaceTabs.length === 0 && (
        <EmptyPlate title="No tabs in this workspace yet" />
      )}
      <span id="tab-row-keys" className="sr-only">
        {ROW_KEYS.map((k) => `${k.keys.join(' ')} ${k.label}`).join(', ')}
      </span>
      <div role="listbox" aria-label="Tabs" className="flex flex-col">
      {workspaceTabs.map((tab, index) => {
        const work = remote[tab.id];
        const workFrom = work && tabs.find((t) => t.id === work.fromTabId);
        const workLabel = workFrom && remoteLabel(work, tabName(workFrom));
        const own = tabActivity(tab.id, cli[tab.id], now);
        const active = tab.id === activeTabId;
        const turn = cli[tab.id] ? getLastTurn(getTabSession(tab.id)) : null;
        const summary = turnSummary(turn, now);
        const tabPlans = plans.byTab[tab.id];
        // A stopped run speaks for a resting tab, in the plan card's own word and lamp.
        const stopped = tabPlans?.map((p) => p.autopilot)
          .filter((ap) => ap?.status === AUTOPILOT_STATUS.FAILED || ap?.status === AUTOPILOT_STATUS.PAUSED)
          .sort((a, b) => (autopilotLamp(b).state === 'fault') - (autopilotLamp(a).state === 'fault'))[0];
        const activity = workLabel && !OWN_BUSY.has(own.kind) ? { kind: 'remote', label: workLabel }
          : stopped && !LIVE.has(own.kind)
            ? { kind: autopilotLamp(stopped).state === 'fault' ? 'failed' : 'permission', label: `auto-pilot ${haltWord(stopped)}`, since: own.since }
            : own;
        kinds.push(activity.kind);
        const queuePos = active ? -1 : queue.findIndex((q) => q.tabId === tab.id);
        const trailOpen = !!summary && openTrail === tab.id;
        // Only the tab you're on or the row you've selected unfolds, so rows never
        // jump as agents start and stop; the lamp and queue outline still show live state.
        const compact = !active && tab.id !== focusedId && !trailOpen
          && renamingId !== tab.id && roleMenuId !== tab.id;
        if (tab.id === focusedId) {
          focusKeys = rowKeys({ active, closable, edited: turn?.edited?.size > 0, plans: tabPlans, summary });
        }
        return (
          <TabRow
            key={tab.id}
            tab={tab}
            index={index}
            name={tabName(tab)}
            info={repo[tab.id]}
            // The moon is the agent's context window: no agent, no moon.
            contextFill={cli[tab.id] ? getTabContextFill(tab.id) : null}
            autoCommit={getTabAutoCommit(tab.id)}
            activityKind={activity.kind}
            activityLabel={activity.label}
            activitySince={activity.since}
            activityQuestion={activity.question}
            agent={cli[tab.id]}
            workLabel={workLabel}
            active={active}
            linked={!active && linkedRepos.some((r) => r.path === tab.projectPath)}
            closable={closable}
            queuePos={queuePos}
            turn={turn}
            summaryText={summary?.text}
            summaryRunning={!!summary?.running}
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
      </div>
      {onNewTab && <NewRow label="tab" keys="Ctrl+T" onClick={onNewTab} />}

      {/* The active repo's plans with work left that no tab is working on. */}
      {plans.loose.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-3 pt-3.5 pb-1.5 edge-b-engraved">
            <span className="engraved-label">plans</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{plans.loose.length}</span>
            <button
              type="button"
              onClick={() => requestPlansPane('open')}
              className="tui-btn ml-auto"
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
      {/* Closing line, pinned to the pane's foot: the tally, then the focused row's keys. */}
      <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-x-1 gap-y-1 bg-[var(--ins-panel)] px-3 pt-2 pb-1 text-[11px] tabular-nums edge-t-engraved">
        <span className="flex items-center gap-1">
          {tally(kinds).map((t, i) => (
            <span key={t.label} className="flex items-center gap-1">
              {i > 0 && <span className="ins-sep-star" aria-hidden="true" />}
              <span className={t.className}>{t.n}</span>
              <span className="text-muted-foreground">{t.label}</span>
            </span>
          ))}
        </span>
        {focusKeys && (
          <span className="flex basis-full flex-wrap items-center gap-x-1 gap-y-1 text-muted-foreground">
            <FrameHints
              hints={[
                { keys: ['↵'], label: 'switch' },
                ...focusKeys.slice(0, 2),
                { keys: ['[', ']'], label: 'section' },
                { keys: ['?'], label: 'keys' },
              ]}
            />
          </span>
        )}
      </div>
    </div>
  );
}
