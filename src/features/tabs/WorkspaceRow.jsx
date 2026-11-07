import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useTabManager } from './TabContext';
import { useAttentionQueue } from './useAgentAttention';
import { RenameField } from './RenameField';
import { StarOutline } from './ActivityGlyphs';

// The workspaces, in the Workspace pane's legend: click to switch (Alt+W cycles),
// double-click or F2 to rename, × to remove, + to add one. An outlined star marks a
// workspace in the background whose agent is waiting on you: warn when one
// needs permission, ok otherwise.
export function WorkspaceRow() {
  const { tabs, workspaces, activeWorkspaceId, switchWorkspace, addWorkspace, renameWorkspace, removeWorkspace } = useTabManager();
  const queue = useAttentionQueue(tabs);
  const [renamingId, setRenamingId] = useState(null);
  const wsOf = (q) => tabs.find((t) => t.id === q.tabId)?.workspaceId;
  const waiting = new Set(queue.map(wsOf));
  const blocked = new Set(queue.filter((q) => q.state === 'permission').map(wsOf));

  return (
    <span className="flex min-w-0 items-center gap-x-1 overflow-hidden text-[11px] leading-none normal-case tracking-normal">
      {workspaces.map((ws) => {
        const active = ws.id === activeWorkspaceId;
        const count = tabs.filter((t) => t.workspaceId === ws.id && !t.master).length;
        if (renamingId === ws.id) {
          return (
            <span key={ws.id} className="flex w-24">
              <RenameField
                label="Workspace name"
                initial={ws.name}
                onCommit={(name) => { renameWorkspace(ws.id, name); setRenamingId(null); }}
                onCancel={() => setRenamingId(null)}
              />
            </span>
          );
        }
        return (
          <span key={ws.id} className="group/ws flex items-center">
            <button
              onClick={() => switchWorkspace(ws.id)}
              onDoubleClick={() => setRenamingId(ws.id)}
              onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); setRenamingId(ws.id); } }}
              aria-pressed={active}
              title={`${ws.name}: ${count} tab${count === 1 ? '' : 's'} (double-click or F2 to rename)`}
              className={cn(
                'flex items-center gap-1 px-1 cursor-pointer border-b',
                active ? 'text-foreground border-[var(--ins-legend)]' : 'text-muted-foreground border-transparent hover:text-foreground',
              )}
            >
              {ws.name}
              <span className="tabular-nums">{count}</span>
              {!active && waiting.has(ws.id) && (
                <span
                  role="img"
                  className={blocked.has(ws.id) ? 'text-[var(--ins-warn)]' : 'text-[var(--ins-ok)]'}
                  aria-label={blocked.has(ws.id) ? 'agent needs permission' : 'agent waiting on you'}
                >
                  <StarOutline />
                </span>
              )}
            </button>
            {workspaces.length > 1 && (
              <button
                onClick={() => removeWorkspace(ws.id)}
                title={`Remove workspace ${ws.name}`}
                aria-label={`Remove workspace ${ws.name}`}
                className="px-0.5 text-muted-foreground opacity-0 group-hover/ws:opacity-100 focus-visible:opacity-100 hover:text-foreground cursor-pointer"
              >
                ×
              </button>
            )}
          </span>
        );
      })}
      <button
        onClick={() => addWorkspace()}
        title="New workspace"
        aria-label="New workspace"
        className="px-1 text-muted-foreground hover:text-foreground cursor-pointer"
      >
        +
      </button>
    </span>
  );
}
