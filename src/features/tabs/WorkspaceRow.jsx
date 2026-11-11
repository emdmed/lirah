import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { isProjectTab, useTabManager } from './TabContext';
import { useAttentionQueue } from './useAgentAttention';
import { RenameField } from './RenameField';
import { Lamp } from '../../components/instrument/Lamp';
import { PanelButton } from '../../components/instrument/PanelButton';
import { Plus } from 'iconoir-react';
import { buttonVariants } from '@/components/ui/button';

// The lamp on a background workspace whose agent waits on you.
function Waiting({ blocked }) {
  return <Lamp state={blocked ? 'fault' : 'wait'} label={blocked ? 'agent needs permission' : 'agent waiting on you'} />;
}

// The workspaces, in the Workspace pane's legend: click to switch (Alt+W cycles),
// double-click or F2 to rename, × to remove, + to add one. A lamp marks a
// workspace in the background whose agent is waiting on you: fault when one
// needs permission, the gold waiting lamp otherwise. When they don't all fit, the others fold into
// a +N chip: one click switches to the only other one, or opens a menu of them.
export function WorkspaceRow() {
  const { tabs, workspaces, activeWorkspaceId, switchWorkspace, addWorkspace, renameWorkspace, removeWorkspace } = useTabManager();
  const queue = useAttentionQueue(tabs);
  const [renamingId, setRenamingId] = useState(null);
  const [fits, setFits] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef(null);
  const measureRef = useRef(null);
  const renamingRef = useRef(false);
  renamingRef.current = renamingId != null;

  const wsOf = (q) => tabs.find((t) => t.id === q.tabId)?.workspaceId;
  const waiting = new Set(queue.map(wsOf));
  const blocked = new Set(queue.filter((q) => q.state === 'permission').map(wsOf));
  const countOf = (ws) => tabs.filter((t) => t.workspaceId === ws.id && isProjectTab(t)).length;
  const star = (ws) => ws.id !== activeWorkspaceId && waiting.has(ws.id) && <Waiting blocked={blocked.has(ws.id)} />;

  // Room for the inline list = legend width minus its left group and the other trailing
  // controls. The hidden copy below gives the list's natural width, so names changing re-measure too.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const legend = row?.closest('.ins-pane-legend');
    if (!legend) return;
    const measure = () => {
      const right = row.parentElement;
      const room = legend.clientWidth - legend.firstElementChild.offsetWidth - (right.offsetWidth - row.offsetWidth) - 16;
      setFits(measureRef.current.offsetWidth <= room);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(legend);
    ro.observe(measureRef.current);
    return () => ro.disconnect();
  }, []);

  const active = workspaces.find((ws) => ws.id === activeWorkspaceId);
  const others = workspaces.filter((ws) => ws !== active);
  const waitingNames = others.filter((ws) => waiting.has(ws.id)).map((ws) => ws.name);
  const waitingText = waitingNames.length ? `; waiting: ${waitingNames.join(', ')}` : '';
  const othersWaiting = waitingNames.length > 0;
  const othersBlocked = others.some((ws) => blocked.has(ws.id));

  const nameButton = (ws) => {
    const isActive = ws.id === activeWorkspaceId;
    const count = countOf(ws);
    return (
      <button
        onClick={() => switchWorkspace(ws.id)}
        onDoubleClick={() => setRenamingId(ws.id)}
        onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); setRenamingId(ws.id); } }}
        aria-pressed={isActive}
        title={`${ws.name}: ${count} tab${count === 1 ? '' : 's'} (double-click or F2 to rename)`}
        className={cn(
          'flex min-w-0 items-center gap-1 px-1 cursor-pointer border-b',
          isActive ? 'text-foreground border-[var(--ins-legend)]' : 'text-muted-foreground border-transparent hover:text-foreground',
        )}
      >
        <span className="ins-name truncate text-[13px]">{ws.name}</span>
        <span className="tabular-nums text-muted-foreground">{count}</span>
        {star(ws)}
      </button>
    );
  };

  const renaming = workspaces.find((ws) => ws.id === renamingId);
  const renameField = renaming && (
    <span key={renaming.id} className="flex w-24">
      <RenameField
        label="Workspace name"
        initial={renaming.name}
        onCommit={(name) => { renameWorkspace(renaming.id, name); setRenamingId(null); }}
        onCancel={() => setRenamingId(null)}
      />
    </span>
  );

  // n / r / x act on the highlighted menu entry. Keys stop here so the pane's own keys (N, [ ]) don't fire.
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

  const chipClass = 'flex shrink-0 items-center gap-0.5 px-0.5 tabular-nums text-muted-foreground hover:text-foreground cursor-pointer data-[state=open]:text-[var(--ins-lamp)]';
  const chipBody = (
    <>
      +{others.length}
      {othersWaiting && <Lamp state={othersBlocked ? 'fault' : 'wait'} className="ml-1" />}
    </>
  );

  let chip = null;
  if (others.length === 1) {
    chip = (
      <button
        onClick={() => switchWorkspace(others[0].id)}
        title={`Switch to ${others[0].name}`}
        aria-label={`Switch to workspace ${others[0].name}${waitingText}`}
        className={chipClass}
      >
        {chipBody}
      </button>
    );
  } else if (others.length > 1) {
    chip = (
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            title={`${others.length} more workspaces`}
            aria-label={`${others.length} more workspaces${waitingText}`}
            className={chipClass}
          >
            {chipBody}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="text-xs"
          onKeyDown={menuKeys}
          // Renaming focuses its field; don't pull focus back to the (gone) chip.
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
          <DropdownMenuLabel>n new · r rename · x remove</DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <span ref={rowRef} className={cn('flex min-w-0 items-center overflow-hidden', fits ? 'gap-x-1' : 'gap-x-0.5', 'text-[11px] leading-none normal-case tracking-normal')}>
      {/* Natural width of the full inline list, for the fit check. */}
      <span ref={measureRef} aria-hidden="true" className="invisible pointer-events-none absolute flex w-max items-center gap-x-1">
        {workspaces.map((ws) => (
          <span key={ws.id} className="flex items-center gap-1 px-1">
            {ws.name}<span>{countOf(ws)}</span>{star(ws)}<span className="px-0.5">×</span>
          </span>
        ))}
      </span>
      {fits ? workspaces.map((ws) => (
        renamingId === ws.id ? renameField : (
          <span key={ws.id} className="group/ws flex items-center">
            {nameButton(ws)}
            {workspaces.length > 1 && (
              <button
                onClick={() => removeWorkspace(ws.id)}
                title={`Remove workspace ${ws.name}`}
                aria-label={`Remove workspace ${ws.name}`}
                type="button"
                data-icon-only
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon-panel' }), 'opacity-0 group-hover/ws:opacity-100 focus-visible:opacity-100')}
              >
                ×
              </button>
            )}
          </span>
        )
      )) : (
        renameField || (
          <>
            {active && <span className="flex min-w-0 max-w-24">{nameButton(active)}</span>}
            {chip}
          </>
        )
      )}
      <PanelButton
        icon={Plus}
        onClick={() => addWorkspace()}
        title="New workspace"
        aria-label="New workspace"
      />
    </span>
  );
}
