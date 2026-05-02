import { useState, useMemo } from 'react';
import { Bot, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubagentContext } from '../contexts/SubagentContext';

function AgentCard({ agent, onDismiss }) {
  const isRunning = agent.status === 'running';
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        'rounded-md p-2 text-xs cursor-pointer transition-colors border border-sketch',
        isRunning && 'border-l-2 border-l-green-500',
      )}
      onClick={() => setExpanded(e => !e)}
      onDoubleClick={() => onDismiss(agent.agent_id)}
      title="Click to expand, double-click to dismiss"
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'inline-block w-2 h-2 rounded-full shrink-0',
            isRunning ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-muted-foreground opacity-50',
          )}
        />
        <span className="font-medium truncate text-sidebar-foreground">
          {agent.slug || agent.agent_id.slice(0, 8)}
        </span>
      </div>
      {agent.last_tool && (
        <div className="mt-1">
          <span className="inline-block px-1 py-0.5 rounded text-[10px] font-mono bg-primary/15 text-primary">
            {agent.last_tool}
          </span>
        </div>
      )}
      {expanded && agent.description && (
        <div className="mt-1 text-[10px] text-muted-foreground line-clamp-3 break-words">
          {agent.description}
        </div>
      )}
    </div>
  );
}

function TabGroup({ tabLabel, agents, onDismiss }) {
  const runningCount = agents.filter(a => a.status === 'running').length;

  return (
    <div className="mb-2">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between text-muted-foreground">
        <span className="truncate">{tabLabel}</span>
        <span className="shrink-0 ml-1">
          {runningCount > 0 ? `${runningCount}/${agents.length}` : agents.length}
        </span>
      </div>
      <div className="flex flex-col gap-1 px-1">
        {agents.map(agent => (
          <AgentCard key={agent.agent_id} agent={agent} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
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

  // Collapsed strip — just status dots
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-2 shrink-0 w-9 border-l border-l-sidebar-border bg-sidebar">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 rounded hover:bg-sidebar-accent cursor-pointer"
          title="Expand agent sidebar"
        >
          <PanelRightOpen size={14} className="text-muted-foreground" />
        </button>
        {totalActiveCount > 0 && (
          <span className="text-[10px] font-bold text-green-500">
            {totalActiveCount}
          </span>
        )}
        {visibleSubagents.map(agent => (
          <span
            key={agent.agent_id}
            className={cn(
              'w-2 h-2 rounded-full',
              agent.status === 'running'
                ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]'
                : 'bg-muted-foreground opacity-40',
            )}
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
          <span className="text-xs font-medium">
            Agents
          </span>
          {totalActiveCount > 0 && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[18px] bg-green-500 text-white">
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
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            No active agents
          </div>
        ) : (
          [...groups.entries()].map(([tabId, group]) => (
            <TabGroup
              key={tabId}
              tabLabel={group.tabLabel}
              agents={group.agents}
              onDismiss={dismiss}
            />
          ))
        )}
      </div>
    </div>
  );
}
