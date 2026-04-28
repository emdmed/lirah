import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

function AgentBubble({ agent, isNew, onDismiss }) {
  const isRunning = agent.status === 'running';
  const [panelOpen, setPanelOpen] = useState(true);
  const [animateIn, setAnimateIn] = useState(isNew);

  useEffect(() => {
    if (isNew) {
      const t = setTimeout(() => setAnimateIn(false), 400);
      return () => clearTimeout(t);
    }
  }, [isNew]);

  return (
    <div
      className={cn(
        'flex items-center gap-2 transition-all duration-300',
        animateIn && 'translate-x-4 opacity-0',
        !animateIn && 'translate-x-0 opacity-100',
      )}
    >
      {/* Conversation box — toggled by single click */}
      {panelOpen && (
        <div
          className="rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
            maxWidth: '340px',
          }}
        >
          <div className="font-medium" style={{ wordBreak: 'break-word' }}>
            {agent.slug || agent.agent_id.slice(0, 8)}
          </div>
          {agent.last_tool && (
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                  color: 'var(--color-primary)',
                }}
              >
                {agent.last_tool}
              </span>
            </div>
          )}
          {agent.description && (
            <div
              className="mt-1 text-[10px]"
              style={{ color: 'var(--color-muted-foreground)', wordBreak: 'break-word' }}
            >
              {agent.description}
            </div>
          )}
        </div>
      )}

      {/* Bubble circle — click toggles panel, double-click dismisses */}
      <button
        onClick={() => setPanelOpen(p => !p)}
        onDoubleClick={() => onDismiss(agent.agent_id)}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          'border transition-all duration-200',
          'hover:scale-110 active:scale-95 cursor-pointer',
        )}
        style={{
          backgroundColor: isRunning ? '#22c55e' : 'var(--color-card)',
          borderColor: isRunning ? '#16a34a' : 'var(--color-border)',
          boxShadow: isRunning ? '0 0 10px rgba(34,197,94,0.4)' : undefined,
          opacity: isRunning ? 1 : 0.6,
        }}
        title={`${agent.slug || agent.agent_id} — click: toggle panel, double-click: dismiss`}
      >
        <Bot size={14} style={{ color: isRunning ? '#fff' : 'var(--color-muted-foreground)' }} />
      </button>
    </div>
  );
}

export function AgentOverlay({
  subagents,
  visible,
  activeSubagentCount,
}) {
  const prevIdsRef = useRef(new Set());
  const [newIds, setNewIds] = useState(new Set());
  const [dismissedIds, setDismissedIds] = useState(new Set());

  const handleDismiss = useCallback((agentId) => {
    setDismissedIds(prev => new Set([...prev, agentId]));
  }, []);

  // Track newly appearing agents for entrance animation
  useEffect(() => {
    const currentIds = new Set(subagents.map(s => s.agent_id));
    const fresh = new Set();
    for (const id of currentIds) {
      if (!prevIdsRef.current.has(id)) fresh.add(id);
    }
    if (fresh.size > 0) {
      setNewIds(fresh);
      // Un-dismiss any agent that reappears
      setDismissedIds(prev => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next.size === prev.size ? prev : next;
      });
      const t = setTimeout(() => setNewIds(new Set()), 500);
      prevIdsRef.current = currentIds;
      return () => clearTimeout(t);
    }
    prevIdsRef.current = currentIds;
  }, [subagents]);

  const visibleSubagents = subagents.filter(s => !dismissedIds.has(s.agent_id));

  if (!visible || visibleSubagents.length === 0) return null;

  // Sort: running agents first, then by start time
  const sorted = [...visibleSubagents].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (a.status !== 'running' && b.status === 'running') return 1;
    return (a.started_at || '').localeCompare(b.started_at || '');
  });

  return (
    <div
      className="fixed z-30 flex flex-col gap-2 items-end pointer-events-none"
      style={{
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
      }}
    >
      {sorted.map(agent => (
        <div key={agent.agent_id} className="pointer-events-auto">
          <AgentBubble
            agent={agent}
            isNew={newIds.has(agent.agent_id)}
            onDismiss={handleDismiss}
          />
        </div>
      ))}
    </div>
  );
}
