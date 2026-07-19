import { useState, useMemo, useEffect } from 'react';
import { Bot, PanelRightClose, PanelRightOpen, X, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubagentContext } from '../contexts/SubagentContext';

function formatElapsed(isoString) {
  if (!isoString) return null;
  const start = new Date(isoString).getTime();
  if (Number.isNaN(start)) return null;
  const secs = Math.floor((Date.now() - start) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h${mins % 60}m`;
}

function extractTaskLabel(desc) {
  if (!desc) return null;

  let text = desc;

  // 1. Strip leading filler words
  text = text.replace(/^(Thoroughly|Carefully|Please)\s+/i, '');

  // 2. Cut at context/instruction boundaries
  const cutPatterns = [
    /\.\s*(This is RESEARCH|Context from|IMPORTANT:|Note:|DO NOT|CRITICAL:)/i,
    /\.\s*(The following|Here is|Below is|Make sure)/i,
  ];
  for (const pattern of cutPatterns) {
    const match = text.match(pattern);
    if (match) {
      text = text.slice(0, match.index + 1);
      break;
    }
  }

  // 3. Strip absolute paths
  text = text.replace(/\s+(at|in|from)\s+\/\S+/g, '');

  // 4. Strip "the X codebase" / "the X project" boilerplate
  text = text.replace(/\s+the\s+\S+\s+(codebase|project|repo(sitory)?)\b/gi, '');

  // 5. Extract purpose clause: "for X" or "to X"
  const purposeMatch = text.match(/\b(?:for|to)\s+(.+?)\.?\s*$/i);
  if (purposeMatch && purposeMatch[1].length > 10) {
    text = purposeMatch[1];
  }

  // 6. Capitalize first letter, strip trailing period
  text = text.replace(/\.\s*$/, '').trim();
  if (text) text = text[0].toUpperCase() + text.slice(1);

  return text || null;
}

function truncate(text, maxLen = 60) {
  if (!text || text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + '\u2026';
}

function AgentCard({ agent, onDismiss, now }) {
  const isRunning = agent.status === 'running';
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const elapsed = formatElapsed(agent.started_at);
  const label = extractTaskLabel(agent.description);
  const summary = truncate(label);

  return (
    <div
      className={cn(
        'relative rounded-sm px-2 py-1.5 text-xs cursor-pointer transition-colors',
        isRunning
          ? 'bg-[color-mix(in_srgb,var(--color-status-success)_8%,transparent)]'
          : 'hover:bg-sidebar-accent/50',
      )}
      onClick={() => setExpanded(e => !e)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Row 1: status dot + task summary + dismiss */}
      <div className="flex items-start gap-1.5">
        <span
          className={cn(
            'inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-[3px]',
            isRunning && 'animate-pulse',
          )}
          style={{
            backgroundColor: isRunning
              ? 'var(--color-status-success)'
              : 'var(--color-muted-foreground)',
            opacity: isRunning ? 1 : 0.35,
            boxShadow: isRunning
              ? '0 0 6px color-mix(in srgb, var(--color-status-success) 50%, transparent)'
              : undefined,
          }}
        />
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
      <div className="flex items-center gap-1.5 mt-1 ml-3 text-[10px] text-muted-foreground/60">
        {agent.last_tool && (
          <span className="inline-block px-1 py-px rounded font-mono bg-primary/10 text-primary/70">
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
        <div className="mt-1.5 ml-3 text-[10px] text-muted-foreground/60 break-words leading-relaxed">
          {label}
        </div>
      )}
    </div>
  );
}

function TabGroup({ tabLabel, agents, onDismiss, now }) {
  const runningCount = agents.filter(a => a.status === 'running').length;

  return (
    <div className="mb-1">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between text-muted-foreground/60">
        <span className="truncate">{tabLabel}</span>
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
      <div className="flex flex-col gap-px px-1">
        {agents.map(agent => (
          <AgentCard key={agent.agent_id} agent={agent} onDismiss={onDismiss} now={now} />
        ))}
      </div>
    </div>
  );
}

// Body-only subagent list (no shell/header) — reused by the tabbed right sidebar.
export function SubagentList() {
  const { allSubagents, totalActiveCount, dismissedIds, dismiss } = useSubagentContext();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (totalActiveCount === 0) return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [totalActiveCount]);

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
        <Bot size={16} className="mx-auto mb-2 text-muted-foreground/30" />
        <div className="text-[11px] text-muted-foreground/50">No agents running</div>
        <div className="mt-1 text-[10px] text-muted-foreground/30">
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
  useEffect(() => {
    if (totalActiveCount === 0) return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [totalActiveCount]);

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
            className="text-[10px] font-bold tabular-nums"
            style={{ color: 'var(--color-status-success)' }}
          >
            {totalActiveCount}
          </span>
        )}
        {visibleSubagents.map(agent => (
          <span
            key={agent.agent_id}
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              agent.status === 'running' && 'animate-pulse',
            )}
            style={{
              backgroundColor: agent.status === 'running'
                ? 'var(--color-status-success)'
                : 'var(--color-muted-foreground)',
              opacity: agent.status === 'running' ? 1 : 0.3,
              boxShadow: agent.status === 'running'
                ? '0 0 4px color-mix(in srgb, var(--color-status-success) 40%, transparent)'
                : undefined,
            }}
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
              className="inline-flex items-center justify-center px-1 py-px rounded text-[10px] font-bold min-w-[16px] tabular-nums"
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
            <Bot size={16} className="mx-auto mb-2 text-muted-foreground/30" />
            <div className="text-[11px] text-muted-foreground/50">
              No agents running
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground/30">
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
