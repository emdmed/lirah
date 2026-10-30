import { useState, useMemo, useEffect } from 'react';
import { usePageVisible } from '../hooks/usePageVisible';
import { Bot, PanelRightClose, PanelRightOpen, X, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubagentContext } from '../contexts/SubagentContext';
import { Lamp } from './instrument/Lamp';
import { useSetting } from '@/features/settings/settingsStore';
import { formatElapsed, extractTaskLabel, truncate } from './agentLabels';
import { Fig13Agents } from './Fig13Agents';

// `defaultExpanded` opens it with the full task label showing (FIG 13's popover).
export function AgentCard({ agent, onDismiss, now, defaultExpanded = false }) {
  const isRunning = agent.status === 'running';
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hovered, setHovered] = useState(false);
  const elapsed = formatElapsed(agent.started_at, now);
  const label = extractTaskLabel(agent.description);
  const summary = truncate(label);

  return (
    <div
      className={cn(
        'relative px-2 py-1.5 text-xs cursor-pointer transition-shadow bg-[var(--ins-raised)]',
        isRunning
          ? 'shadow-[inset_0_0_0_1px_var(--ins-edge-strong)]'
          : 'shadow-[inset_0_0_0_1px_var(--ins-edge)] hover:shadow-[inset_0_0_0_1px_var(--ins-edge-strong)]',
      )}
      onClick={() => setExpanded(e => !e)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Row 1: status dot + task summary + dismiss */}
      <div className="flex items-start gap-1.5">
        <Lamp state={isRunning ? 'on' : 'off'} blink={isRunning} label={isRunning ? 'running' : 'done'} className="mt-[2px]" />
        <span className="text-[11px] text-sidebar-foreground leading-tight line-clamp-2 break-words min-w-0">
          {summary || agent.slug || agent.agent_id.slice(0, 8)}
        </span>
        {hovered && (
          <button
            className="ml-auto shrink-0 p-0.5 rounded hover:bg-sidebar-accent cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(agent.agent_id);
            }}
            title="Dismiss"
          >
            <X size={10} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Row 2: metadata — tool, turns, elapsed */}
      <div className="flex items-center gap-1.5 mt-1 ml-3 text-[11px] text-muted-foreground">
        {agent.last_tool && (
          <span className="inline-block px-1 py-px font-mono shadow-[inset_0_0_0_1px_var(--ins-edge)] text-foreground/80">
            {agent.last_tool}
          </span>
        )}
        {agent.message_count > 0 && (
          <span className="flex items-center gap-0.5" title={`${agent.message_count} messages`}>
            <MessageSquare size={8} />
            <span className="tabular-nums">{agent.message_count}</span>
          </span>
        )}
        {elapsed && (
          <span className="tabular-nums ml-auto">{elapsed}</span>
        )}
      </div>

      {/* Expanded: full task label */}
      {expanded && label && label !== summary && (
        <div className="mt-1.5 ml-3 text-[11px] text-muted-foreground break-words leading-relaxed">
          {label}
        </div>
      )}
    </div>
  );
}

function TabGroup({ tabLabel, agents, onDismiss, now }) {
  const runningCount = agents.filter(a => a.status === 'running').length;
  const [figures] = useSetting('figures');
  // FIG 13's "+k more" / "+k done earlier" open the full card list.
  const [listed, setListed] = useState(false);

  const list = (
    <div className="flex flex-col gap-px px-1">
      {agents.map(agent => (
        <AgentCard key={agent.agent_id} agent={agent} onDismiss={onDismiss} now={now} />
      ))}
    </div>
  );

  return (
    <div className="mb-1">
      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider flex items-center justify-between text-muted-foreground">
        <span className="truncate">{tabLabel}</span>
        {figures === 'full' && listed && (
          <button
            onClick={() => setListed(false)}
            className="ml-auto mr-2 shrink-0 font-normal normal-case tracking-normal hover:text-sidebar-foreground cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ins-lamp)]"
            title="Back to FIG.13"
          >
            fan
          </button>
        )}
        <span className="shrink-0 ml-1 tabular-nums">
          {runningCount > 0 ? (
            <>
              <span style={{ color: 'var(--color-status-success)' }}>{runningCount}</span>
              <span className="opacity-40">/{agents.length}</span>
            </>
          ) : (
            <span className="opacity-40">{agents.length}</span>
          )}
        </span>
      </div>
      {figures === 'full' && !listed ? (
        <div className="px-1">
          <Fig13Agents
            agents={agents}
            now={now}
            onDismiss={onDismiss}
            onOpenList={() => setListed(true)}
            renderCard={(agent) => (
              <AgentCard agent={agent} onDismiss={onDismiss} now={now} defaultExpanded />
            )}
            fallback={list}
          />
        </div>
      ) : list}
    </div>
  );
}

// Body-only subagent list (no shell/header) — reused by the tabbed right sidebar.
export function SubagentList() {
  const { allSubagents, totalActiveCount, dismissedIds, dismiss } = useSubagentContext();

  const [now, setNow] = useState(Date.now());
  const pageVisible = usePageVisible();
  useEffect(() => {
    if (totalActiveCount === 0 || !pageVisible) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [totalActiveCount, pageVisible]);

  const visibleSubagents = useMemo(
    () => allSubagents.filter(s => !dismissedIds.has(s.agent_id)),
    [allSubagents, dismissedIds]
  );

  const groups = useMemo(() => {
    const map = new Map();
    for (const agent of visibleSubagents) {
      if (!map.has(agent.tabId)) {
        map.set(agent.tabId, { tabLabel: agent.tabLabel, agents: [] });
      }
      map.get(agent.tabId).agents.push(agent);
    }
    for (const group of map.values()) {
      group.agents.sort((a, b) => {
        if (a.status === 'running' && b.status !== 'running') return -1;
        if (a.status !== 'running' && b.status === 'running') return 1;
        return (a.started_at || '').localeCompare(b.started_at || '');
      });
    }
    return map;
  }, [visibleSubagents]);

  if (visibleSubagents.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <Bot size={16} className="mx-auto mb-2 text-faint" />
        <div className="text-[11px] text-muted-foreground">No agents running</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Agents appear here when spawned during tool use
        </div>
      </div>
    );
  }

  return (
    <>
      {[...groups.entries()].map(([tabId, group]) => (
        <TabGroup
          key={tabId}
          tabLabel={group.tabLabel}
          agents={group.agents}
          onDismiss={dismiss}
          now={now}
        />
      ))}
    </>
  );
}

export function AgentSidebar() {
  const {
    allSubagents,
    totalActiveCount,
    sidebarVisible,
    toggleSidebar,
    dismissedIds,
    dismiss,
  } = useSubagentContext();

  const [collapsed, setCollapsed] = useState(false);
  // Tick every 5s to keep elapsed times fresh
  const [now, setNow] = useState(Date.now());
  const pageVisible = usePageVisible();
  useEffect(() => {
    if (totalActiveCount === 0 || !pageVisible) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [totalActiveCount, pageVisible]);

  const visibleSubagents = useMemo(
    () => allSubagents.filter(s => !dismissedIds.has(s.agent_id)),
    [allSubagents, dismissedIds]
  );

  // Group by tabId, preserving order
  const groups = useMemo(() => {
    const map = new Map();
    for (const agent of visibleSubagents) {
      if (!map.has(agent.tabId)) {
        map.set(agent.tabId, { tabLabel: agent.tabLabel, agents: [] });
      }
      map.get(agent.tabId).agents.push(agent);
    }
    // Sort within each group: running first, then by start time
    for (const group of map.values()) {
      group.agents.sort((a, b) => {
        if (a.status === 'running' && b.status !== 'running') return -1;
        if (a.status !== 'running' && b.status === 'running') return 1;
        return (a.started_at || '').localeCompare(b.started_at || '');
      });
    }
    return map;
  }, [visibleSubagents]);

  // Collapsed strip
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-2 shrink-0 w-8 border-l border-l-sidebar-border bg-sidebar">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 rounded hover:bg-sidebar-accent cursor-pointer"
          title="Expand agent sidebar"
        >
          <PanelRightOpen size={14} className="text-muted-foreground" />
        </button>
        {totalActiveCount > 0 && (
          <span
            className="text-[11px] font-bold tabular-nums"
            style={{ color: 'var(--color-status-success)' }}
          >
            {totalActiveCount}
          </span>
        )}
        {visibleSubagents.map(agent => (
          <Lamp
            key={agent.agent_id}
            state={agent.status === 'running' ? 'on' : 'off'}
            blink={agent.status === 'running'}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col shrink-0 overflow-hidden w-48 border-l border-l-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 shrink-0 border-b border-b-sidebar-border">
        <div className="flex items-center gap-1.5">
          <Bot size={12} className="text-muted-foreground" />
          <span className="text-xs font-medium">Agents</span>
          {totalActiveCount > 0 && (
            <span
              className="inline-flex items-center justify-center px-1 py-px rounded text-[11px] font-bold min-w-[16px] tabular-nums"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-status-success) 20%, transparent)',
                color: 'var(--color-status-success)',
              }}
            >
              {totalActiveCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-0.5 rounded hover:bg-sidebar-accent cursor-pointer"
          title="Collapse sidebar"
        >
          <PanelRightClose size={14} className="text-muted-foreground" />
        </button>
      </div>

      {/* Scrollable agent list */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {visibleSubagents.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <Bot size={16} className="mx-auto mb-2 text-faint" />
            <div className="text-[11px] text-muted-foreground">
              No agents running
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Agents appear here when spawned during tool use
            </div>
          </div>
        ) : (
          [...groups.entries()].map(([tabId, group]) => (
            <TabGroup
              key={tabId}
              tabLabel={group.tabLabel}
              agents={group.agents}
              onDismiss={dismiss}
              now={now}
            />
          ))
        )}
      </div>
    </div>
  );
}
