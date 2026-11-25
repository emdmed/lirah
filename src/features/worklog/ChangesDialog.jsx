import { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { DiffBar, compactCount } from '../../components/instrument/DiffBar';
import { Keycap } from '../../components/instrument/Keycap';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { EmptyPlate } from '../../components/EmptyState';
import { errorMessage } from '../../lib/errorMessage';
import { basename } from '../../utils/pathUtils';
import { useToast } from '../toast';
import { fallbackTitle } from './changesPrompt';
import { changesNotes } from './changesNotes';
import { useChanges, weekRange } from './useChanges';

const OPEN_FIRST = 3; // features open on arrival, biggest first
const TALK = '__talk';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const when = (at) => new Date(at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// '19–25 NOV', or '28 OCT–3 NOV' across a month.
function rangeLabel({ from, to }) {
  const [a, b] = [from, to].map((k) => new Date(`${k}T00:00`));
  const mon = (d) => d.toLocaleDateString('en', { month: 'short' }).toUpperCase();
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${mon(b)}` : `${a.getDate()} ${mon(a)}–${b.getDate()} ${mon(b)}`;
}

/** The week's changes in `projectPath`, by feature: what was built, the turns it took, and the release that shipped it. */
export function ChangesDialog({ open, onOpenChange, projectPath, range: given }) {
  const range = useMemo(() => given ?? weekRange(), [given]);
  const ch = useChanges(projectPath, range);
  const toast = useToast();
  const listRef = useRef(null);
  const [openIds, setOpenIds] = useState(null); // null: the first OPEN_FIRST features
  const isOpen = (id, i) => (openIds ? openIds.has(id) : i < OPEN_FIRST);
  const setOpen = (id, next) => setOpenIds((cur) => {
    const s = new Set(cur ?? ch.features.slice(0, OPEN_FIRST).map((f) => f.id));
    if (next) s.add(id); else s.delete(id);
    return s;
  });

  const talkTurns = Object.values(ch.talk).reduce((n, t) => n + t, 0);
  const title = (c) => ch.titles[c.id] ?? fallbackTitle(c);

  const copy = () => navigator.clipboard.writeText(changesNotes(ch.features, ch.titles))
    .then(() => toast.success(`Copied notes for ${plural(ch.features.length, 'feature')}`), (e) => toast.error(errorMessage(e)));

  const onKeyDown = (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey && ch.features.length) { e.preventDefault(); copy(); return; }
    if (e.key === 'Enter' && e.target.tagName === 'SUMMARY') {
      e.preventDefault(); // toggled here, not natively, so it acts once
      e.target.parentElement.open = !e.target.parentElement.open;
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...(listRef.current?.querySelectorAll(':scope > details > summary') ?? [])];
    if (!rows.length) return;
    e.preventDefault();
    const i = rows.indexOf(document.activeElement);
    rows[Math.max(0, Math.min(rows.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  };

  const updateMap = () => {
    try {
      ch.fm.build(false).catch(() => {}); // the map reloads when the build ends, and the list regroups
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const statusText = `${rangeLabel(range)} · ${plural(ch.features.length, 'feature')} · ${plural(ch.releases.length, 'release')}`.toUpperCase();
  const busy = ch.loading || ch.titling;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        className="flex max-h-[85vh] flex-col gap-0"
        lamp="on"
        status={busy ? <span className="inline-flex items-center gap-1.5"><Scanner size="sm" label={ch.loading ? 'Reading the log' : 'Titling changes'} />{statusText}</span> : statusText}
        hints={[{ keys: ['↑', '↓'], label: 'feature' }, { keys: ['↵'], label: 'open' }, { keys: ['c'], label: 'copy notes' }]}
        onKeyDown={onKeyDown}
        // Rows arrive after the log loads; until then Radix focuses the dialog, so ↑↓ and c still land here.
        onOpenAutoFocus={(e) => { const row = listRef.current?.querySelector('summary'); if (row) { e.preventDefault(); row.focus(); } }}
      >
        <DialogTitle>Changes in {basename(projectPath) || 'this project'}</DialogTitle>
        <DialogDescription className="sr-only">This week's changes by feature, with the turns, lines and release of each.</DialogDescription>

        {ch.unmapped.length > 0 && (
          <div className="flex items-center gap-2 py-1.5 text-[11px] text-muted-foreground edge-b-engraved">
            <Lamp state="warn" />
            <span className="min-w-0 flex-1 truncate" title={ch.unmapped.join('\n')}>
              {plural(ch.unmapped.length, 'file')} in no feature, so some changes may sit under the wrong one
            </span>
            <button type="button" onClick={updateMap} disabled={ch.fm.status === 'building'} className="tui-btn">
              {ch.fm.status === 'building' ? 'updating map…' : 'update map'}
            </button>
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto pt-1 text-xs">
          {!ch.loading && !ch.changes.length && (
            <EmptyPlate title="No changes this week" description="prompts that edit files in this repo show here, grouped by feature" />
          )}
          {ch.features.map((f, i) => (
            <details
              key={f.id ?? 'none'}
              open={isOpen(f.id, i)}
              onToggle={(e) => e.currentTarget.open !== isOpen(f.id, i) && setOpen(f.id, e.currentTarget.open)}
              className="edge-b-engraved"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-1.5 outline-none hover:bg-foreground/5 focus-visible:bg-foreground/10">
                <span className="ins-name min-w-0 flex-1 truncate text-[13px] text-foreground">{f.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{plural(f.changes.length, 'change')} · {plural(f.turns, 'turn')}</span>
                <span className="w-[120px] shrink-0">
                  <DiffBar added={f.added} removed={f.removed} side={40} fmt={compactCount} />
                </span>
                <span className="flex w-[140px] shrink-0 justify-end gap-1">
                  {f.versions.map((v) => <Keycap key={v} size="sm">{v}</Keycap>)}
                </span>
              </summary>
              <div className="flex flex-col gap-2 pb-3 pl-1">
                {f.summary && <p className="text-muted-foreground">{f.summary}</p>}
                <ul className="flex flex-col gap-2">
                  {f.changes.map((c) => <ChangeItem key={c.id} change={c} title={title(c)} />)}
                </ul>
              </div>
            </details>
          ))}
          {talkTurns > 0 && (
            <details key={TALK} className="edge-b-engraved">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-1.5 outline-none hover:bg-foreground/5 focus-visible:bg-foreground/10">
                <span className="ins-name min-w-0 flex-1 truncate text-[13px] text-muted-foreground">Talk, no code</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{plural(talkTurns, 'turn')}</span>
              </summary>
              <ul className="flex flex-col gap-0.5 pb-3 pl-1 text-muted-foreground">
                {Object.entries(ch.talk).sort().map(([d, n]) => (
                  <li key={d} className="tabular-nums">
                    {new Date(`${d}T00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {plural(n, 'turn')}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangeItem({ change: c, title }) {
  return (
    <li className="flex items-start gap-2">
      <Lamp state="ok" settled className="mt-1" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-[13px] text-foreground">{title}</span>
          {c.version ? <Keycap size="sm">{c.version}</Keycap>
            : c.noCommit && <span className="shrink-0 rounded-sm border border-dashed border-[var(--ins-warn)] px-1 text-[11px] text-[var(--ins-warn)]">no commit</span>}
        </div>
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {when(c.start)} · {plural(c.turns, 'turn')} · {plural(c.files.length, 'file')}{c.lines ? ` · ±${compactCount(c.lines)} lines` : ''}
        </span>
        {c.decisions.length > 0 && (
          <ol className="list-decimal pl-5 text-[11px] text-muted-foreground">
            {c.decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ol>
        )}
      </div>
    </li>
  );
}
