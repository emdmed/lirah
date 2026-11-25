import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { DiffBar, compactCount } from '../../components/instrument/DiffBar';
import { Keycap } from '../../components/instrument/Keycap';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { SegmentBank } from '../../components/instrument/SegmentBank';
import { EmptyPlate } from '../../components/EmptyState';
import { INK, useFigureCompact } from '../../components/instrument/figure';
import { errorMessage } from '../../lib/errorMessage';
import { basename } from '../../utils/pathUtils';
import { useDialog } from '../dialogs/DialogProvider';
import { useToast } from '../toast';
import { fallbackTitle } from './changesPrompt';
import { changesNotes } from './changesNotes';
import { useChanges, weekRange } from './useChanges';
import { Fig40ChangesWeek } from './Fig40ChangesWeek';
import { Fig41ChangesDay } from './Fig41ChangesDay';
import { dayKey } from './weekGrid';
import { ReviewBlock, clock, reviewCounts } from './ReviewBlock';
import { flagKey, assumptionKey } from './reviewState';

const TALK = '__talk';
const DAY_MS = 24 * 60 * 60 * 1000;
const MODES = [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }];
const noon = (key) => new Date(`${key}T12:00`).getTime(); // a step of whole days stays clear of DST
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const when = (at) => new Date(at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// '19–25 NOV', or '28 OCT–3 NOV' across a month.
function rangeLabel({ from, to }) {
  const [a, b] = [from, to].map((k) => new Date(`${k}T00:00`));
  const mon = (d) => d.toLocaleDateString('en', { month: 'short' }).toUpperCase();
  if (from === to) return a.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${mon(b)}` : `${a.getDate()} ${mon(a)}–${b.getDate()} ${mon(b)}`;
}

/** The week's changes in `projectPath`, by feature: what was built, the turns it took, and the release that shipped it. */
export function ChangesDialog({ open, onOpenChange, projectPath, range: given, sessionId, fillPrompt }) {
  const [mode, setMode] = useState('week');
  const [anchor, setAnchor] = useState(() => dayKey(Date.now())); // the day shown, or the last day of the week
  const range = useMemo(() => given ?? (mode === 'day' ? { from: anchor, to: anchor } : weekRange(noon(anchor))), [given, mode, anchor]);
  const ch = useChanges(projectPath, range);
  const toast = useToast();
  const dialog = useDialog();
  const listRef = useRef(null);
  const [openIds, setOpenIds] = useState(() => new Set()); // features start folded
  const [pending, setPending] = useState(null); // { change, feature } to show once the week list loads
  const today = dayKey(Date.now());
  const go = (nextMode, nextAnchor) => { setMode(nextMode); setAnchor(nextAnchor < today ? nextAnchor : today); setOpenIds(new Set()); };
  const step = (dir) => go(mode, dayKey(noon(anchor) + dir * (mode === 'day' ? 1 : 7) * DAY_MS));
  const isOpen = (id) => openIds.has(id);
  const setOpen = (id, next) => setOpenIds((cur) => {
    const s = new Set(cur);
    if (next) s.add(id); else s.delete(id);
    return s;
  });

  // A change clicked in the figure: its feature opens in the list below and the change scrolls in.
  useEffect(() => {
    if (!pending || ch.loading) return;
    const f = ch.features.find((x) => x.changes.some((c) => c.id === pending.change)) ?? ch.features.find((x) => x.id === pending.feature);
    setPending(null);
    if (!f) return;
    setOpenIds((cur) => new Set([...cur, f.id]));
    requestAnimationFrame(() => {
      const el = document.getElementById(`change-${pending.change}`) ?? listRef.current?.querySelector(`[data-feature="${f.id ?? ''}"] > summary`);
      el?.scrollIntoView({ block: 'nearest' });
      el?.focus();
    });
  }, [pending, ch.loading, ch.features]);
  const showChange = (c) => setPending({ change: c.id, feature: c.feature });

  const talkTurns = Object.values(ch.talk).reduce((n, t) => n + t, 0);
  const talkItems = Object.values(ch.talkItems).flat();
  const talkReview = { flags: talkItems.filter((t) => t.kind === 'flag'), assumptions: talkItems.filter((t) => t.kind === 'assumption'), decided: talkItems.filter((t) => t.kind === 'decision') };

  // The change's commits as one diff: from before its first to its last, over its files.
  const openDiff = (c) => {
    if (!c?.commits?.length || !ch.repo) return;
    const files = c.files.filter((f) => !f.startsWith('/')).map((f) => `${ch.repo}/${f}`);
    dialog.open('gitDiff', { repoPath: ch.repo, baseRef: `${c.commits[0]}^`, headRef: c.commits.at(-1), changedFiles: files, filePath: files[0], fileList: true });
  };
  // Typed and submitted like the prompt box's send (usePromptSender).
  const sendToAgent = async (text) => {
    if (!sessionId) throw new Error('This tab has no terminal yet');
    await invoke('write_to_terminal', { sessionId, data: text });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await invoke('write_to_terminal', { sessionId, data: '\r' });
  };
  const act = {
    review: ch.review,
    prompts: ch.prompts,
    answer: ch.answer,
    unanswer: ch.unanswer,
    ask: (f) => {
      onOpenChange(false);
      sendToAgent(`About ${f.n ?? 'the flag'} from ${clock(f.at)} ("${f.text}"): please address it.`)
        .then(() => ch.answer(flagKey(f), 'asked'), (e) => toast.error(`Not sent: ${errorMessage(e)}`));
    },
    wrong: (a) => {
      ch.answer(assumptionKey(a), 'wrong');
      onOpenChange(false); // closed first, so the prompt box keeps the focus
      fillPrompt?.(`This assumption is wrong: "${a.text}". `);
    },
  };
  const title = (c) => ch.titles[c.id] ?? fallbackTitle(c);

  const copy = () => navigator.clipboard.writeText(changesNotes(ch.features, ch.titles))
    .then(() => toast.success(`Copied notes for ${plural(ch.features.length, 'feature')}`), (e) => toast.error(errorMessage(e)));

  const onKeyDown = (e) => {
    if (e.defaultPrevented || e.target.closest('input, textarea')) return;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); return; }
    if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey && ch.features.length) { e.preventDefault(); copy(); return; }
    if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // The next open flag after the focus, wrapping; its row unfolds first.
      const flags = [...(listRef.current?.querySelectorAll('[data-open-flag]') ?? [])];
      if (!flags.length) return;
      e.preventDefault();
      const next = flags.find((el) => document.activeElement?.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ?? flags[0];
      const row = next.closest('details');
      if (row && !row.open) row.open = true;
      requestAnimationFrame(() => { next.scrollIntoView({ block: 'nearest' }); next.focus(); });
      return;
    }
    if (e.key === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const id = document.activeElement?.closest('[id^="change-"]')?.id.slice('change-'.length);
      const c = id && ch.changes.find((x) => x.id === id);
      if (c?.commits.length) { e.preventDefault(); openDiff(c); }
      return;
    }
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
        size="full"
        className="flex flex-col gap-0"
        lamp="on"
        status={busy ? <span className="inline-flex items-center gap-1.5"><Scanner size="sm" label={ch.loading ? 'Reading the log' : 'Titling changes'} />{statusText}</span> : statusText}
        hints={[{ keys: ['←', '→'], label: mode }, { keys: ['↑', '↓'], label: 'feature' }, { keys: ['↵'], label: 'open' }, { keys: ['c'], label: 'copy notes' }, { keys: ['f'], label: 'next flag' }, { keys: ['d'], label: 'diff' }]}
        onKeyDown={onKeyDown}
        // Rows arrive after the log loads; until then the dialog holds focus (not the ← button), so ↑↓ and c still land here.
        onOpenAutoFocus={(e) => { e.preventDefault(); (listRef.current?.querySelector('summary') ?? e.target).focus(); }}
      >
        <div className="flex flex-wrap items-center gap-3 pb-1.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle>Changes in {basename(projectPath) || 'this project'}</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              What the agent changed from your prompts, grouped by the part of the app it touched.
            </DialogDescription>
          </div>
          <span className="ml-auto flex items-center gap-1">
            <button type="button" className="tui-btn" onClick={() => step(-1)} aria-label={`Previous ${mode}`}>←</button>
            <span className="min-w-[8.5rem] text-center tabular-nums text-[12px] text-foreground" aria-live="polite">{readableRange(range, today)}</span>
            <button type="button" className="tui-btn" onClick={() => step(1)} disabled={anchor >= today} aria-label={`Next ${mode}`}>→</button>
          </span>
          <SegmentBank value={mode} options={MODES} onChange={(m) => go(m, anchor)} label="Range" />
        </div>

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
            <EmptyPlate title={`No changes this ${mode}`} description="prompts that edit files in this repo show here, grouped by feature" />
          )}
          {/* Wide windows put the figure beside the list, held in view while the list scrolls. */}
          <div className="flex flex-col 2xl:flex-row 2xl:items-start 2xl:gap-8">
            {ch.features.length > 0 && (
              <div className="px-1 pb-3 pt-2 edge-b-engraved 2xl:sticky 2xl:top-0 2xl:w-[760px] 2xl:shrink-0">
                {range.from === range.to
                  ? <Fig41ChangesDay features={ch.features} talk={ch.talk} releases={ch.releases} titles={ch.titles} day={range.from} onOpen={showChange} />
                  : <Fig40ChangesWeek features={ch.features} talk={ch.talk} releases={ch.releases} range={range} />}
                <FigLegend day={range.from === range.to} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {ch.features.map((f) => (
                <details
                  key={f.id ?? 'none'}
                  data-feature={f.id ?? ''}
                  open={isOpen(f.id)}
                  onToggle={(e) => e.currentTarget.open !== isOpen(f.id) && setOpen(f.id, e.currentTarget.open)}
                  className="edge-b-engraved"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-1.5 outline-none hover:bg-foreground/5 focus-visible:bg-foreground/10">
                    <span className="ins-name min-w-0 truncate text-[13px] text-foreground">{f.name}</span>
                    <FeatureCounts changes={f.changes} review={ch.review} />
                    <span className="shrink-0 tabular-nums text-muted-foreground">{plural(f.changes.length, 'change')} · {plural(f.turns, 'turn')}</span>
                    <span className="w-[120px] shrink-0">
                      <DiffBar added={f.added} removed={f.removed} side={40} fmt={compactCount} />
                    </span>
                    <span className="flex min-w-[140px] shrink-0 justify-end gap-1">
                      {f.versions.map((v) => <Keycap key={v} size="sm" title={`Shipped in ${v}`}>{v}</Keycap>)}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-2 pb-3 pl-1">
                    {f.summary && <p className="text-muted-foreground">{f.summary}</p>}
                    <ul className="flex flex-col gap-2">
                      {f.changes.map((c) => <ChangeItem key={c.id} change={c} title={title(c)} act={act} onDiff={() => openDiff(c)} />)}
                    </ul>
                  </div>
                </details>
              ))}
              {talkTurns > 0 && (
                <details key={TALK} className="edge-b-engraved">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-1.5 outline-none hover:bg-foreground/5 focus-visible:bg-foreground/10">
                    <span className="ins-name min-w-0 truncate text-[13px] text-muted-foreground">Talk, no code</span>
                    <FeatureCounts changes={[{ flags: talkReview.flags, assumptions: talkReview.assumptions, decided: talkReview.decided }]} review={ch.review} />
                    <span className="shrink-0 tabular-nums text-muted-foreground">{plural(talkTurns, 'turn')}</span>
                  </summary>
                  <ul className="flex flex-col gap-0.5 pl-1 text-muted-foreground">
                    {Object.entries(ch.talk).sort().map(([d, n]) => (
                      <li key={d} className="tabular-nums">
                        {new Date(`${d}T00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {plural(n, 'turn')}
                      </li>
                    ))}
                  </ul>
                  <div className="pb-3 pl-1"><ReviewBlock {...talkReview} act={act} heading="decided while talking" /></div>
                </details>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 'Today', 'Wed 19 Nov', 'This week' or '12–18 Nov': the range in words, beside the arrows.
function readableRange({ from, to }, today) {
  if (from === to) return from === today ? 'Today' : new Date(`${from}T00:00`).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
  if (to === today) return 'This week';
  return rangeLabel({ from, to }).replace(/[A-Z]{3}/g, (m) => m[0] + m.slice(1).toLowerCase());
}

// The key to the marks in FIG.40 / FIG.41, drawn in the figures' own ink. Compact mode has no figure, so no key.
function FigLegend({ day }) {
  const compact = useFigureCompact();
  if (compact) return null;
  const mark = (d) => <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true" className="shrink-0">{d}</svg>;
  const dot = (cx, r) => <circle cx={cx} cy="5" r={r} style={{ fill: INK.fg }} />;
  const diamond = <path d="M9 2 L12 5 L9 8 L6 5 Z" style={{ fill: INK.paper, stroke: INK.fg }} />;
  const release = <><line x1="9" y1="0" x2="9" y2="10" style={{ stroke: INK.muted, strokeDasharray: '2 2' }} />{diamond}</>;
  const items = day
    ? [[mark(dot(9, 2.5)), 'one prompt'], [mark(<rect x="2" y="3" width="14" height="4" style={{ fill: INK.fg }} />), 'a change over several prompts'], [mark(release), 'release'], [null, 'number = prompts']]
    : [[mark(<>{dot(4, 1.8)}{dot(13, 3.5)}</>), 'prompts that day, bigger = more'], [mark(diamond), 'release'], [mark(<><rect x="1" y="3" width="10" height="4" style={{ fill: INK.fg }} /><rect x="11" y="3" width="6" height="4" style={{ fill: INK.muted }} /></>), 'lines added, then removed']];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-[11px] text-muted-foreground">
      {items.map(([m, t]) => <span key={t} className="inline-flex items-center gap-1.5">{m}{t}</span>)}
    </div>
  );
}

// 'N open flags · N assumptions · N decisions' for a feature row; only open flags warn.
function FeatureCounts({ changes, review }) {
  const { text, warn } = reviewCounts({
    flags: changes.flatMap((c) => c.flags ?? []),
    assumptions: changes.flatMap((c) => c.assumptions ?? []),
    decided: changes.flatMap((c) => c.decided ?? []),
  }, review);
  return <span className={`min-w-0 flex-1 truncate text-[11px] ${warn ? 'text-[var(--ins-warn)]' : 'text-muted-foreground'}`}>{text}</span>;
}

const TAG = 'shrink-0 rounded-sm border border-dashed border-[var(--ins-warn)] px-1 text-[11px] text-[var(--ins-warn)]';
const testsText = (c) => (c.tests?.length ? ` · tests: ${c.tests.map(basename).join(', ')}`
  : c.qa?.length ? ` · QA recipe: ${c.qa.map((f) => basename(f).replace(/\.md$/, '')).join(', ')}` : '');

function ChangeItem({ change: c, title, act, onDiff }) {
  const drift = c.drift;
  return (
    <li id={`change-${c.id}`} tabIndex={-1} className="flex items-start gap-2 outline-none focus-visible:bg-foreground/10">
      <Lamp state="ok" settled className="mt-1" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-[13px] text-foreground">{title}</span>
          {!c.tests?.length && <span title="No unit test file among its files" className={TAG}>no unit test</span>}
          {c.version ? <Keycap size="sm" title={`Shipped in ${c.version}`}>{c.version}</Keycap>
            : c.noCommit && <span title="Edited, but never committed" className={TAG}>no commit</span>}
          {c.commits?.length > 0 && <button type="button" className="tui-btn shrink-0" onClick={onDiff} title="Its commits as one diff (d)">diff</button>}
        </div>
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {when(c.start)} · {plural(c.turns, 'turn')} · {plural(c.files.length, 'file')}{c.lines ? ` · ±${compactCount(c.lines)} lines` : ''}{testsText(c)}
        </span>
        {c.plan && (
          <span className="tabular-nums text-[11px] text-muted-foreground">
            plan · {c.plan.slug} · chunk {c.plan.n}{c.plan.total ? `/${c.plan.total}` : ''}
            {drift && <> · <span className={drift.ratio >= 2 ? 'text-[var(--ins-warn)]' : ''}>named {drift.named}, touched {drift.touched}</span></>}
          </span>
        )}
        <ReviewBlock flags={c.flags} assumptions={c.assumptions} decided={c.decided} act={act} />
      </div>
    </li>
  );
}
