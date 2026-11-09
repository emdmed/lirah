import { WindowControls } from '../../components/WindowControls';
import { KeyChord } from '../../components/instrument/Keycap';
import { useSetting } from '../settings/settingsStore';
import { IS_MAC } from '../../utils/pathUtils';
import { shortcutKeys } from '../../lib/shortcuts';
import { formatDuration } from '../../lib/formatDuration';
import { cn } from '../../lib/utils';
import { Lamp, jobLamp } from '../../components/instrument/Lamp';
import { useBookmarks } from '../bookmarks';
import { tabDisplayName, useTabActions, useTabManager } from '../tabs/TabContext';
import { useTabsSummary } from '../tabs/useTabsSummary';
import { requestAttentionJump, useAttentionQueue } from '../tabs/useAgentAttention';
import { activityLamp, remoteLabel, remoteWork, tabActivity } from '../tabs/tabActivity';
import { rowActivity } from '../tabs/TabsSummaryPane';
import { useTabPlans } from '../plans/useTabPlans';
import { useAgentJobs } from '../agent-jobs/AgentJobsContext';
import { useEffect, useState } from 'react';
import { TabsSummaryPane } from '../tabs/TabsSummaryPane';
import { ZenDrawer } from './ZenDrawer';
import { closeDrawer, toggleDrawer } from './zenDrawerStore';

// The active tab portals its LirahMark (lit while its session runs) in here.
export const ZEN_LINE_MARK_SLOT_ID = 'zen-line-mark-slot';
// The active tab portals today's tokens in here (its token stats live in the tab).
export const ZEN_LINE_TOKENS_SLOT_ID = 'zen-line-tokens-slot';

const ITEM = 'shrink-0 px-1 hover:text-foreground focus-ring';

// Zen's bottom line: stands in for the header, so it drags the window and
// carries the window controls (on hover, at the right; at the left on macOS).
// Drag and controls follow the title-bar setting, as the header does.
export function ZenLine() {
  const [showTitleBar] = useSetting('showTitleBar');
  const drag = showTitleBar ? { 'data-tauri-drag-region': true } : {};
  const { tabs, workspaceTabs, workspaces, activeWorkspaceId, activeTabId, zenColumns, switchTab, switchWorkspace } = useTabManager();
  const columns = zenColumns.length ? zenColumns : [activeTabId];
  const { bookmarks } = useBookmarks();
  // Same sources as the tabs pane, so every lamp matches its row.
  const { cli, now } = useTabsSummary(tabs);
  const plans = useTabPlans(tabs, activeTabId);
  const queue = useAttentionQueue(tabs);
  const { jobs } = useAgentJobs();
  const remote = remoteWork(tabs, cli, now);
  const tabName = (tab) => tabDisplayName(tab, bookmarks);
  const running = jobs.filter((j) => j.status === 'running').length;
  // The tab you're on is on screen; the next one waiting is the one to name.
  const waiting = queue.find((q) => q.tabId !== activeTabId);
  const waitingTab = waiting && tabs.find((t) => t.id === waiting.tabId);

  const controls = showTitleBar && (
    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <WindowControls />
    </div>
  );

  return (
    <div
      className="group flex items-center gap-3 h-8 px-2 shrink-0 select-none text-xs font-mono bg-[var(--tui-bar)] shadow-[inset_0_1px_0_0_var(--tui-line)]"
      {...drag}
    >
      {IS_MAC && controls}
      <div id={ZEN_LINE_MARK_SLOT_ID} className="flex items-center shrink-0" />
      {workspaces.map((w) => (
        <button
          key={w.id}
          type="button"
          className={cn(ITEM, w.id === activeWorkspaceId ? 'text-foreground' : 'text-muted-foreground')}
          aria-current={w.id === activeWorkspaceId || undefined}
          onClick={() => switchWorkspace(w.id)}
        >
          {w.name}
        </button>
      ))}
      <span data-zen-segment="tabs" className="flex shrink-0 items-center gap-1 text-muted-foreground">
        <button type="button" className={ITEM} onClick={() => toggleDrawer('tabs')} title="Tabs (Alt+4)">tabs</button>
        {workspaceTabs.map((tab) => {
          const work = remote[tab.id];
          const workFrom = work && tabs.find((t) => t.id === work.fromTabId);
          const activity = rowActivity(
            tabActivity(tab.id, cli[tab.id], now),
            workFrom && remoteLabel(work, tabName(workFrom)),
            plans.byTab[tab.id],
          );
          const queued = tab.id !== activeTabId && queue.some((q) => q.tabId === tab.id);
          const column = columns.indexOf(tab.id) + 1;
          return (
            <button
              key={tab.id}
              type="button"
              className="inline-flex items-center gap-px focus-ring"
              title={`${tabName(tab)} · ${activity.label}${column ? ` · column ${column}` : ''}`}
              aria-label={`${tabName(tab)}, ${activity.label}${column ? `, column ${column}` : ''}`}
              aria-current={tab.id === activeTabId || undefined}
              onClick={() => switchTab(tab.id)}
            >
              <Lamp {...activityLamp(activity.kind, queued)} />
              {column > 0 && (
                <span aria-hidden className={cn('text-[9px] leading-none tabular-nums', tab.id === activeTabId && 'text-foreground')}>{column}</span>
              )}
            </button>
          );
        })}
      </span>
      {waitingTab && (
        <button type="button" className={cn(ITEM, 'text-[var(--ins-lamp)]')} onClick={requestAttentionJump} title="Jump to it (Alt+A)">
          {tabName(waitingTab)} waits {formatDuration(Math.max(1, Math.round((now - waiting.at) / 60000)) * 60000)}
        </button>
      )}
      {running > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground" title={`${running} agent job${running > 1 ? 's' : ''} running`}>
          <Lamp {...jobLamp('running')} />jobs {running}
        </span>
      )}
      <div id={ZEN_LINE_TOKENS_SLOT_ID} className="flex items-center shrink-0 text-muted-foreground tabular-nums" />
      <div className="flex-1 self-stretch" {...drag} />
      <KeyChord keys={shortcutKeys('zen-toggle')} label="zen" />
      {!IS_MAC && controls}
      <TabsDrawer activeTabId={activeTabId} />
    </div>
  );
}

// Column keys on a selected row, ahead of the row's own (x closes there).
const COLUMN_HINTS = [
  { keys: ['↵'], label: 'swap in' },
  { keys: ['1–3'], label: 'column' },
  { keys: ['x'], label: 'off screen' },
];

// The workspace pane's tab rows, with their keys (j/k, row keys) plus the
// column keys above. Switching tab closes it, so you land in the new tab's terminal.
function TabsDrawer({ activeTabId }) {
  useEffect(() => () => closeDrawer('tabs'), [activeTabId]);
  const { placeZenColumn: put, dropZenColumn: drop, switchTab } = useTabActions();
  const [notice, setNotice] = useState(null);

  const onKeyDownCapture = (e) => {
    const id = e.target.dataset?.tabRow;
    if (!id || e.ctrlKey || e.metaKey || e.altKey) return;
    const act = e.key === 'Enter' ? () => { put(id, null); switchTab(id); }
      : ['1', '2', '3'].includes(e.key) ? () => put(id, Number(e.key) - 1)
        : e.key === 'x' ? () => drop(id) : null;
    if (!act) return setNotice(null);
    e.preventDefault();
    e.stopPropagation();
    try {
      act();
      setNotice(null);
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <ZenDrawer id="tabs" title="tabs" keys={shortcutKeys('zen-tabs')} className="w-[28rem]" focus={`[data-tab-row="${activeTabId}"]`}>
      <div
        className="flex flex-1 flex-col"
        onKeyDownCapture={onKeyDownCapture}
        // The row under the pointer takes the keys, so 1–3/↵/x act on the row you point at.
        onPointerMove={(e) => {
          const row = e.target.closest?.('[data-tab-row]');
          if (row && row !== document.activeElement && !row.contains(document.activeElement)) row.focus({ preventScroll: true });
        }}
      >
        {notice && <div role="status" className="px-3 py-1.5 text-xs text-[var(--ins-lamp)] edge-b-engraved">{notice}</div>}
        <TabsSummaryPane rowHints={COLUMN_HINTS} />
      </div>
    </ZenDrawer>
  );
}
