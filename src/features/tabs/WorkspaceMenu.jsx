import { useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { isProjectTab, useTabManager } from './TabContext';
import { useAttentionQueue } from './useAgentAttention';
import { RenameField } from './RenameField';
import { Lamp } from '../../components/instrument/Lamp';
import { Button } from '@/components/ui/button';
import { Add, ChevronDown } from '@/components/icons';

// The lamp on a background workspace whose agent waits on you.
function Waiting({ blocked }) {
  return <Lamp state={blocked ? 'fault' : 'wait'} label={blocked ? 'agent needs permission' : 'agent waiting on you'} />;
}

// The workspaces, as a dropdown in the header next to the project: the trigger
// names the active one (double-click or F2 renames it), the menu switches
// (Alt+W cycles), and n / r / x add, rename and remove. A lamp marks a
// workspace in the background whose agent is waiting on you: fault when one
// needs permission, the gold waiting lamp otherwise.
export function WorkspaceMenu() {
  const { tabs, workspaces, activeWorkspaceId, switchWorkspace, addWorkspace, renameWorkspace, removeWorkspace } = useTabManager();
  const queue = useAttentionQueue(tabs);
  const [renamingId, setRenamingId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const renamingRef = useRef(false);
  renamingRef.current = renamingId != null;

  const wsOf = (q) => tabs.find((t) => t.id === q.tabId)?.workspaceId;
  const waiting = new Set(queue.map(wsOf));
  const blocked = new Set(queue.filter((q) => q.state === 'permission').map(wsOf));
  const countOf = (ws) => tabs.filter((t) => t.workspaceId === ws.id && isProjectTab(t)).length;
  const star = (ws) => ws.id !== activeWorkspaceId && waiting.has(ws.id) && <Waiting blocked={blocked.has(ws.id)} />;

  const active = workspaces.find((ws) => ws.id === activeWorkspaceId);
  const others = workspaces.filter((ws) => ws !== active);
  const waitingNames = others.filter((ws) => waiting.has(ws.id)).map((ws) => ws.name);
  const waitingText = waitingNames.length ? `; waiting: ${waitingNames.join(', ')}` : '';
  const othersBlocked = others.some((ws) => blocked.has(ws.id));

  const renaming = workspaces.find((ws) => ws.id === renamingId);
  if (renaming) {
    return (
      <span className="flex w-28 shrink-0">
        <RenameField
          label="Workspace name"
          initial={renaming.name}
          onCommit={(name) => { renameWorkspace(renaming.id, name); setRenamingId(null); }}
          onCancel={() => setRenamingId(null)}
        />
      </span>
    );
  }

  // n / r / x act on the highlighted menu entry. Keys stop here so pane keys don't fire.
  const menuKeys = (e) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const id = document.activeElement?.closest('[data-ws-id]')?.dataset.wsId;
    const act = { n: () => addWorkspace(), r: () => id && setRenamingId(id), x: () => id && removeWorkspace(id) }[e.key];
    if (!act) return;
    e.preventDefault();
    setMenuOpen(false);
    act();
  };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="panel"
          className="shrink-0 gap-1.5 normal-case"
          onDoubleClick={() => active && setRenamingId(active.id)}
          onKeyDown={(e) => { if (e.key === 'F2' && active) { e.preventDefault(); setRenamingId(active.id); } }}
          title="Workspace (Alt+W cycles; double-click or F2 to rename)"
          aria-label={`Workspace ${active?.name ?? ''}${waitingText}`}
        >
          <span className="truncate max-w-32">{active?.name}</span>
          {waitingNames.length > 0 && <Lamp state={othersBlocked ? 'fault' : 'wait'} />}
          <ChevronDown size={12} className="text-faint" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-48 text-xs"
        onKeyDown={menuKeys}
        // Renaming focuses its field; don't pull focus back to the (gone) trigger.
        onCloseAutoFocus={(e) => { if (renamingRef.current) e.preventDefault(); }}
      >
        <DropdownMenuRadioGroup value={activeWorkspaceId} onValueChange={switchWorkspace}>
          {workspaces.map((ws) => (
            <DropdownMenuRadioItem key={ws.id} value={ws.id} data-ws-id={ws.id} className="gap-1">
              {ws.name}
              <span className="tabular-nums text-muted-foreground">{countOf(ws)}</span>
              {star(ws)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => addWorkspace()} className="gap-1.5">
          <Add size={12} /> new workspace
        </DropdownMenuItem>
        <DropdownMenuLabel>n new · r rename · x remove</DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
