import { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { DiffBar, compactCount } from '../../components/instrument/DiffBar';
import { Keycap } from '../../components/instrument/Keycap';
import { Scanner } from '../../components/instrument/Scanner';
import { EmptyPlate } from '../../components/EmptyState';
import { tabDisplayName, useTabManager } from '../tabs/TabContext';
import { getTabSession } from '../tabs/terminalActivity';
import { ChangesDialog } from './ChangesDialog';
import { useBookmarks } from '../bookmarks';
import { useChanges, weekRange } from './useChanges';
import { reviewCounts } from './ReviewBlock';

const Count = ({ n, word }) => <><span className="font-medium text-foreground">{n}</span> {word}{n === 1 ? '' : 's'}</>;

/** This week's changes of every tab in the workspace, one row each; a row shows that tab's changes here, and Esc comes back. */
export function WorkspaceChangesDialog({ open, onOpenChange }) {
  const { workspaceTabs, workspaces, activeWorkspaceId } = useTabManager();
  const { bookmarks } = useBookmarks();
  const [picked, setPicked] = useState(null); // the tab whose changes show, in place of the list
  const listRef = useRef(null);
  const range = useMemo(() => weekRange(), []);
  const name = workspaces.find((ws) => ws.id === activeWorkspaceId)?.name ?? 'this workspace';

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...(listRef.current?.querySelectorAll('button') ?? [])];
    if (!rows.length) return;
    e.preventDefault();
    const i = rows.indexOf(document.activeElement);
    rows[Math.max(0, Math.min(rows.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  };

  if (picked) {
    return <ChangesDialog open onOpenChange={(next) => !next && setPicked(null)} projectPath={picked.projectPath} sessionId={getTabSession(picked.id)} />;
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        className="flex flex-col gap-0"
        lamp="on"
        status={`THIS WEEK · ${workspaceTabs.length} TAB${workspaceTabs.length === 1 ? '' : 'S'}`}
        hints={[{ keys: ['↑', '↓'], label: 'tab' }, { keys: ['↵'], label: 'its changes' }]}
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(e) => { e.preventDefault(); (listRef.current?.querySelector('button') ?? e.target).focus(); }}
      >
        <div className="flex min-w-0 flex-col gap-0.5 pb-1.5">
          <DialogTitle>Changes in {name}</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground">
            What the agent changed this week in each tab. Pick a tab for its changes by feature.
          </DialogDescription>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto pt-1 text-xs">
          {!workspaceTabs.length && <EmptyPlate title="No tabs in this workspace" description="open a project tab to see its changes here" />}
          {workspaceTabs.map((t) => <TabRow key={t.id} tab={t} name={tabDisplayName(t, bookmarks)} range={range} onOpen={() => setPicked(t)} />)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// shortcut: each row reads the work log on its own; share one read if workspaces grow past a handful of tabs.
function TabRow({ tab, name, range, onOpen }) {
  const ch = useChanges(tab.projectPath, range, { title: false });
  const talkTurns = Object.values(ch.talk).reduce((n, t) => n + t, 0);
  const talk = Object.values(ch.talkItems).flat();
  const { text, warn } = reviewCounts({
    flags: [...ch.changes.flatMap((c) => c.flags ?? []), ...talk.filter((t) => t.kind === 'flag')],
    assumptions: [...ch.changes.flatMap((c) => c.assumptions ?? []), ...talk.filter((t) => t.kind === 'assumption')],
    decided: [...ch.changes.flatMap((c) => c.decided ?? []), ...talk.filter((t) => t.kind === 'decision')],
  }, ch.review);
  const turns = ch.features.reduce((n, f) => n + f.turns, 0) + talkTurns;
  const added = ch.features.reduce((n, f) => n + f.added, 0);
  const removed = ch.features.reduce((n, f) => n + f.removed, 0);
  const versions = [...new Set(ch.features.flatMap((f) => f.versions))];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-2 py-2.5 text-left outline-none edge-b-engraved hover:bg-foreground/5 focus-visible:bg-foreground/10"
    >
      <span className="ins-name min-w-0 max-w-[40%] truncate text-[17px] font-semibold leading-tight text-foreground">{name}</span>
      <span className={`min-w-0 flex-1 truncate text-[11px] ${warn ? 'text-[var(--ins-warn)]' : 'text-muted-foreground'}`}>
        {ch.loading ? <Scanner size="sm" label="Reading the log" /> : !turns ? 'no changes this week' : text}
      </span>
      {turns > 0 && (
        <>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            <Count n={ch.features.length} word="feature" /> · <Count n={ch.changes.length} word="change" /> · <Count n={turns} word="turn" />
          </span>
          <span className="w-[120px] shrink-0">
            {added + removed > 0 && <DiffBar added={added} removed={removed} side={40} fmt={compactCount} />}
          </span>
          <span className="flex min-w-[140px] shrink-0 justify-end gap-1">
            {versions.map((v) => <Keycap key={v} size="sm" title={`Shipped in ${v}`}>{v}</Keycap>)}
          </span>
        </>
      )}
    </button>
  );
}
