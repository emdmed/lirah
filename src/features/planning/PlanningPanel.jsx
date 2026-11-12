import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { EmptyPlate } from '../../components/EmptyState';
import { FrameHints } from '../../components/instrument/FrameHints';
import { Lamp } from '../../components/instrument/Lamp';
import { PaneLegend } from '../../components/instrument/PaneLegend';
import { PanelButton } from '../../components/instrument/PanelButton';
import { Scanner } from '../../components/instrument/Scanner';
import { Checkbox } from '../../components/ui/checkbox';
import { useRowCursor } from '../../hooks/useRowCursor';
import { hash8 } from '../../lib/ids';
import { cn } from '../../lib/utils';
import { basename, parentDir } from '../../utils/pathUtils';
import { useConfirm, useDialogStore } from '../dialogs/DialogProvider';
import { StepOrbit } from '../git/StepOrbit';
import { ChunkBody } from '../plans/ChunkRow';
import { usePlans } from '../plans/PlansContext';
import { SPLIT_STATUS } from '../plans/planModel';
import { buildDraftAllPrompt, buildDraftPartPrompt, DRAFT_DIR, DRAFT_PARTS, hasMockupLink, slugify } from '../plans/planPrompts';
import { requestPlanFocus } from '../plans/plansPaneEvents';
import { useRepoRoot } from '../plans/planRepoRoot';
import { draftFiles, readPlanSource } from '../plans/usePlanFiles';
import { MONTH_DIR } from '../plans/usePlanStore';
import { getAgentHookState, subscribeAgentHooks } from '../tabs/agentHookState';
import { getTabPrompt } from '../tabs/tabPrompts';
import { getTabSession } from '../tabs/terminalActivity';
import { useToast } from '../toast';
import {
  DRAFT_META, draftRepo, markPartSent, setDraftMockup, setPlanningFolder, setPlanningMode, settleSentParts, startDraft,
  useDraftMockup, usePlanningFolder, useSentParts,
} from './planningModeStore';

// The whole road: write the parts, split them into chunks, review (revise, re-chunk, approve), then pending in the plans pane.
const STEPS = [{ id: 'draft', label: 'draft' }, { id: 'split', label: 'split' }, { id: 'review', label: 'review' }, { id: 'pending', label: 'pending' }];
// shortcut: polls, since the ~/.lirah watcher only reports .json files; watch .md there if this shows up in profiles.
const POLL_MS = 2000;
// The rows' grid: body, the row's text, its action.
const SPINE_ROW = 'grid min-w-0 grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-x-2.5 px-3 py-[3px] text-[12px]';
// The parts' rows as a table: body, name, context box, action, in fixed columns so every row lines up.
const PART_ROW = 'grid min-w-0 grid-cols-[14px_minmax(0,1fr)_3ch_5.5rem] items-start gap-x-2.5 px-3 py-[3px] text-[12px]';
const PART_NAMES = new Set(DRAFT_PARTS.map((p) => `${p.id}.md`));

const list = (path) => invoke('read_directory', { path }).catch(() => []); // a missing folder is fine
const tilde = (path) => path.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~');

/** Every draft folder, newest month first, with the repo it is for and whether it was approved or cancelled. */
async function draftFolders() {
  const base = `${await invoke('get_home_dir')}/.lirah/plans`;
  const months = (await list(base)).filter((e) => e.is_dir && MONTH_DIR.test(e.name)).sort((a, b) => b.name.localeCompare(a.name));
  const paths = (await Promise.all(months.map((m) => list(m.path)))).flat().filter((e) => e.is_dir && DRAFT_DIR.test(e.name)).map((e) => e.path);
  return Promise.all(paths.map(async (path) => {
    const meta = await invoke('read_file_content', { path: `${path}/${DRAFT_META}` }).then(JSON.parse).catch(() => ({}));
    return { path, repo: meta.repo || null, settled: !!meta.settled };
  }));
}

const writeMeta = (folder, meta) => invoke('write_file_content', { path: `${folder}/${DRAFT_META}`, content: `${JSON.stringify(meta)}\n` });

/** improve_the_ui_plan → "Improve the ui" */
function draftName(folder) {
  const words = basename(folder).replace(DRAFT_DIR, '').replace(/_+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** …/plans/2026-11/x_plan → 2026-11 */
const draftMonth = (folder) => basename(parentDir(folder));

/** Calls `load` now and every POLL_MS while `key` stays the same; the latest result. */
function usePolled(load, key) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    let live = true;
    const tick = () => load().then((v) => live && setValue(v)).catch(() => {});
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(id); };
  }, [key]); // load is read fresh each tick
  return value;
}

/** The hook state of the agent in `tabId`'s terminal ('working', 'waiting'…), or null when none reports in. */
function useAgentState(tabId) {
  return useSyncExternalStore(subscribeAgentHooks, () => getAgentHookState(getTabSession(tabId))?.state ?? null);
}

/** A group: a legend and a hairline, as in dialogs, with a count or note at the end. */
function Group({ label, end, children }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="tui-dialog-group px-3 pt-5">
        <span className="ins-legend">{label}</span>
        {end != null && <span className="order-last text-[11px] tabular-nums text-muted-foreground">{end}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * Planning mode's half of the tab: a draft folder written part by part
 * (architecture, backend, db, ui), then the single chunked plan made from it.
 * Approving the plan hands it to the plans pane as pending. A project tab
 * lists its repo's drafts (and ones not tied to a repo yet); the workspace
 * terminal (`master`) lists every repo's.
 */
export function PlanningPanel({ tabId, tabName, projectPath, selectedFiles, addFiles, removeFile, master = false }) {
  const { repoRoot: tabRepo } = useRepoRoot(projectPath);
  const toast = useToast();
  const confirm = useConfirm();
  const dialogs = useDialogStore();
  const folder = usePlanningFolder(tabId);
  const setFolder = (f) => setPlanningFolder(tabId, f);
  const [newTitle, setNewTitle] = useState('');
  const [picking, setPicking] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const newRef = useRef(null);
  const agent = useAgentState(tabId);
  const sent = useSentParts(folder);
  const mockup = useDraftMockup(folder);

  const allFolders = usePolled(draftFolders, 'folders') || [];
  const current = allFolders.find((f) => f.path === folder);
  // The workspace terminal plans for whichever repo the draft names; a tab for its own.
  const repoRoot = master ? current?.repo ?? null : tabRepo;
  const { plans, createPlan, rechunk, updatePlan, cancelPlan, sendPlanRevise } = usePlans(repoRoot);

  // Drafts not yet approved or cancelled; an approved one lives in the plans pane.
  const settled = new Set((plans || []).filter((p) => (!p.draft || p.cancelledAt) && p.importedFrom).map((p) => p.importedFrom.path));
  const folders = allFolders.filter((f) => !f.settled && !settled.has(f.path) && (master || !f.repo || f.repo === tabRepo));
  const shownFolders = folder && !folders.some((f) => f.path === folder) ? [{ path: folder, repo: current?.repo ?? null }, ...folders] : folders;
  const files = usePolled(() => (folder ? draftFiles(folder) : Promise.resolve([])), folder) || [];
  const names = files.map(basename);
  const plan = folder && plans?.find((p) => p.draft && !p.cancelledAt && p.importedFrom?.path === folder);
  const title = plan?.title || (folder ? draftName(folder) : '');
  const splitting = plan && (plan.split === SPLIT_STATUS.RUNNING || plan.split === SPLIT_STATUS.QUEUED);
  // The draft's files as they are now vs. what the chunks were split from: revise and redraft edit them under the chunks.
  const sourceHash = usePolled(() => (plan ? readPlanSource(folder).then(hash8) : Promise.resolve(null)), `${folder}:${plan?.id}`);
  const stale = !!plan && !splitting && !!sourceHash && !!plan.importedFrom?.hash && sourceHash !== plan.importedFrom.hash;
  const inContext = files.filter((f) => selectedFiles.has(f)).length;
  const written = DRAFT_PARTS.filter((p) => names.includes(`${p.id}.md`)).length;
  const extras = files.filter((f) => !PART_NAMES.has(basename(f)));
  const hasParts = files.some((f) => basename(f) !== 'plan.md');
  // A mockup asked for is made in the draft step: ui.md must link it before the draft is approved.
  const uiPath = files.find((f) => basename(f) === 'ui.md') || null;
  const uiText = usePolled(() => (uiPath && mockup ? invoke('read_file_content', { path: uiPath }) : Promise.resolve('')), `${uiPath}:${mockup}`);
  // A draft without ui.md has no UI to mock up.
  const mockupMissing = mockup && !!uiPath && !hasMockupLink(uiText);
  const showPicker = !folder || picking;

  useEffect(() => { if (folder) settleSentParts(folder, DRAFT_PARTS.map((p) => p.id).filter((id) => names.includes(`${id}.md`))); });

  const run = async (what) => {
    setBusy(true);
    try {
      await what();
    } catch (e) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // As the tasks pane's plan: the prompt is typed into the terminal, so ask first when no agent is there to read it.
  const agentReady = async () => {
    if (agent && agent !== 'working') return true;
    return confirm({
      title: agent ? `The agent in ${tabName} is busy` : `No agent detected in ${tabName}`,
      description: agent
        ? 'The prompt will be queued behind what the agent is doing.'
        : 'The prompt is typed into this tab\'s terminal. Launch an agent there first (Ctrl+K), or send anyway if one is already running.',
      confirmLabel: 'Send anyway',
      destructive: false,
    });
  };

  const send = (text) => {
    const prompt = getTabPrompt(tabId);
    if (!prompt) throw new Error('This tab has no terminal yet');
    return prompt.send(text);
  };

  const draftPart = (part) => run(async () => {
    if (!(await agentReady())) return;
    await send(buildDraftPartPrompt({ title, folder, part, existing: names, mockup }));
    markPartSent(folder, part);
  });

  const draftAll = () => run(async () => {
    if (!(await agentReady())) return;
    await send(buildDraftAllPrompt({ title, folder, existing: names, mockup }));
    DRAFT_PARTS.filter((p) => !names.includes(`${p.id}.md`)).forEach((p) => markPartSent(folder, p.id));
  });

  const createDraft = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    run(async () => {
      await startDraft(tabId, newTitle, master ? null : tabRepo);
      setNewTitle('');
      setPicking(false);
    });
  };

  const chooseDraft = (path) => {
    setFolder(path);
    setPicking(false);
  };

  const canApproveDraft = !!repoRoot && hasParts && !mockupMissing && !busy;
  const approveDraft = () => run(async () => {
    const source = await readPlanSource(folder);
    if (!source.trim()) throw new Error('The draft has no .md files yet');
    // A draft not tied to a repo yet belongs to the one it is approved in.
    if (!current?.repo) await writeMeta(folder, { repo: repoRoot });
    await createPlan(repoRoot, { source, importedFrom: { path: folder, hash: hash8(source) }, draft: true });
  });

  const canApprovePlan = plan && !splitting && !stale && plan.chunks.length > 0;
  const approvePlan = () => run(async () => {
    updatePlan(repoRoot, plan.id, { draft: false });
    await writeMeta(folder, { repo: repoRoot, settled: true });
    setPlanningMode(tabId, false);
    requestPlanFocus(plan.id);
    toast.success(`${plan.title || title} is in the plans pane, pending`);
  });

  // Undoable: cancelling only marks the plan, so undo takes it and its draft back up.
  const cancel = () => {
    const was = folder;
    cancelPlan(repoRoot, plan.id);
    writeMeta(was, { repo: repoRoot, settled: true }).catch(() => {});
    setFolder(null);
    containerRef.current?.focus({ preventScroll: true });
    toast.toast(`Cancelled ${plan.title || title}; it is tucked in the plans pane`, {
      action: {
        label: 'undo',
        onClick: () => {
          cancelPlan(repoRoot, plan.id, false);
          writeMeta(was, { repo: repoRoot }).catch(() => {});
          setPlanningFolder(tabId, was);
        },
      },
    });
  };

  const rechunkPlan = () => !splitting && run(() => rechunk(repoRoot, plan.id));

  const revise = (e) => {
    e.preventDefault();
    if (!notes.trim()) return;
    run(async () => {
      if (!(await agentReady())) return;
      await sendPlanRevise(repoRoot, plan.id, notes, tabId);
      setNotes('');
    });
  };

  const openFile = (path) => dialogs.open('markdown', { filePath: path, files }, null);

  // The rows j/k step through: drafts while choosing one, else the draft's parts and files, then the chunks.
  const rows = showPicker
    ? shownFolders.map((f) => ({ key: f.path, activate: () => chooseDraft(f.path) }))
    : [
      // Once there is a plan the parts are folded; their rows are clicked, not stepped through.
      ...(plan ? [] : DRAFT_PARTS).map((p) => {
        const path = files.find((f) => basename(f) === `${p.id}.md`);
        return { key: p.id, part: p.id, activate: () => (path ? openFile(path) : draftPart(p.id)) };
      }),
      ...(plan ? [] : extras).map((path) => ({ key: path, activate: () => openFile(path) })),
      ...(plan?.chunks || []).map((c) => ({ key: c.id, activate: () => {
        const el = document.getElementById(`planning-chunk-${c.id}`);
        if (el) el.open = !el.open;
      } })),
    ];
  const { containerRef, registerList, onKeyDown: onCursorKey, onBlur, cursorIndex } = useRowCursor();
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    registerList({ count: rows.length, activate: (i) => rowsRef.current[i]?.activate(), scrollToIndex: () => {} });
  }, [rows.length, registerList]);
  useEffect(() => () => registerList(null), [registerList]);
  const cursorKey = cursorIndex != null ? rows[cursorIndex]?.key : null;
  const cursorProps = (key) => ({ 'data-nav-row': '', 'data-cursor': cursorKey === key || undefined });

  const onPaneKey = (e) => {
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const row = cursorIndex != null ? rows[cursorIndex] : null;
    const act = {
      n: () => { setPicking(true); requestAnimationFrame(() => newRef.current?.focus()); },
      c: () => folder && setPicking((v) => !v),
      d: () => row?.part && !plan && draftPart(row.part),
      D: () => folder && !plan && !showPicker && draftAll(),
      m: () => folder && setDraftMockup(folder, !mockup),
      a: () => (plan ? canApprovePlan && approvePlan() : folder && canApproveDraft && approveDraft()),
      r: () => plan && rechunkPlan(),
    }[e.key];
    if (act) {
      e.preventDefault();
      e.stopPropagation();
      act();
      return;
    }
    onCursorKey(e);
  };

  const hints = [
    { keys: ['j', 'k'], label: 'move' },
    { keys: ['↵'], label: showPicker ? 'choose' : 'open' },
    ...(showPicker ? [{ keys: ['n'], label: 'new' }] : []),
    ...(folder && !plan && !showPicker ? [{ keys: ['d'], label: 'draft' }, { keys: ['D'], label: 'draft all' }] : []),
    ...(plan ? [{ keys: ['r'], label: 're-chunk' }] : []),
    ...(folder ? [{ keys: ['a'], label: 'approve' }] : []),
    { keys: ['alt', 'P'], label: 'close' },
  ];

  const splitState = splitting ? 'live' : plan?.split === SPLIT_STATUS.FAILED ? 'fault' : stale ? 'warn' : 'done';
  const orbit = plan
    ? ['done', splitState, splitState === 'done' ? 'next' : 'queued', 'queued']
    : [folder && agent === 'working' ? 'live' : 'next', 'queued', 'queued', 'queued'];

  return (
    <div data-pane="4" data-title="[4] planning" data-legend className="ins-pane-enter tui-pane relative ml-1.5 flex min-h-0 min-w-0 flex-1 flex-col">
      <PaneLegend index="4" title="Planning" note={tabName} />
      <div
        ref={containerRef}
        tabIndex={-1}
        data-pane-focus
        onKeyDown={onPaneKey}
        onBlur={onBlur}
        className="flex min-h-0 flex-1 flex-col text-[12px] outline-none"
      >
        <header className="flex h-9 shrink-0 items-center gap-2 px-3 edge-b-engraved">
          <StepOrbit steps={STEPS} states={orbit} />
          <PanelButton className="ml-auto" onClick={() => setPlanningMode(tabId, false)} title="Back to the full-width terminal (Alt+P)">close</PanelButton>
        </header>

        <div className="min-h-0 flex-1 overflow-auto pb-3">
          {showPicker ? (
            <Group label="drafts" end={folders.length || null}>
              <ul className="flex flex-col">
                {shownFolders.map((f) => (
                  <li key={f.path}>
                    <button
                      type="button"
                      {...cursorProps(f.path)}
                      onClick={() => chooseDraft(f.path)}
                      aria-current={f.path === folder || undefined}
                      className={cn(
                        'flex h-7 w-full items-center gap-2 pl-4 pr-3 text-left outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ins-legend)]',
                        f.path === folder && 'ins-row-selected',
                      )}
                    >
                      <span className={cn('ins-name truncate text-[13px]', f.path === folder ? 'text-foreground' : 'text-muted-foreground')}>{draftName(f.path)}</span>
                      {master && <span className="shrink-0 text-[11px] text-muted-foreground">{f.repo ? basename(f.repo) : 'no repo'}</span>}
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{draftMonth(f.path)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={createDraft} className="flex items-center gap-1.5 px-3 pt-1">
                <input
                  ref={newRef}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="new draft: what are we planning?"
                  aria-label="New draft title"
                  className="ins-well h-7 min-w-0 flex-1 px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                <PanelButton type="submit" variant="outline" disabled={!newTitle.trim() || busy}>new</PanelButton>
              </form>
              {shownFolders.length === 0 && (
                <p className="px-3 pt-1.5 text-[11px] text-muted-foreground">
                  or ask the agent to start one: <code className="text-foreground">lirah plans draft &lt;title&gt;</code>
                </p>
              )}
              {!folder && shownFolders.length > 0 && (
                <EmptyPlate className="mt-10" title="Choose a draft" description="or start a new one: it opens with a plan.md holding its title" />
              )}
            </Group>
          ) : (
            // The chosen draft, set as the panel's name, its folder under it; c or a click opens the list again.
            <div className="flex items-start gap-2 px-3 pt-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="ins-name truncate text-[22px] leading-tight text-foreground">{title}</h2>
                <span className="truncate text-[11px] text-muted-foreground" title={folder}>
                  {master && `${current?.repo ? basename(current.repo) : 'no repo'} · `}{tilde(folder)}
                </span>
              </div>
              <PanelButton className="ml-auto mt-1 shrink-0" onClick={() => setPicking(true)} title="Choose another draft or start one (c)">change</PanelButton>
            </div>
          )}

          {folder && !showPicker && (
            <PartsGroup
              folded={!!plan}
              files={files}
              extras={extras}
              names={names}
              sent={sent}
              agent={agent}
              written={written}
              inContext={inContext}
              selectedFiles={selectedFiles}
              addFiles={addFiles}
              removeFile={removeFile}
              mockup={mockup}
              onMockup={() => setDraftMockup(folder, !mockup)}
              onDraft={draftPart}
              onDraftAll={draftAll}
              onOpen={openFile}
              cursorProps={cursorProps}
            />
          )}

          {plan && !showPicker && (
            <Group label="chunks" end={splitting ? null : stale ? 'draft changed since the split · r' : plan.chunks.length}>
              <div role="status" className="contents">
                {splitting && (
                  <div className="flex items-center gap-2 px-3 py-1 text-[11px] text-muted-foreground">
                    <Scanner size="sm" label="Splitting" /> splitting into chunks
                  </div>
                )}
              </div>
              {plan.split === SPLIT_STATUS.FAILED && (
                <p role="alert" className="px-3 text-[11px] text-[var(--ins-fault)]">The split failed: {plan.splitError || 'no reason given'}. Re-chunk (r) to try again.</p>
              )}
              <ol className="flex flex-col pt-1">
                {plan.chunks.map((c) => (
                  <li key={c.id} data-body="queued" className="ins-spine relative">
                    <details id={`planning-chunk-${c.id}`}>
                      <summary {...cursorProps(c.id)} className={cn(SPINE_ROW, 'cursor-pointer list-none')}>
                        <span className="flex h-5 w-3.5 items-center justify-center"><ChunkBody body="queued" label="pending" /></span>
                        <span className="min-w-0 leading-5 text-foreground"><span className="mr-2.5 text-[11px] tabular-nums text-muted-foreground">{c.n}</span>{c.title}</span>
                      </summary>
                      {c.details && <p className="whitespace-pre-wrap pb-1 pl-[36px] pr-3 text-[11px] leading-relaxed text-muted-foreground">{c.details}</p>}
                    </details>
                  </li>
                ))}
              </ol>
              <form className="flex flex-col gap-1.5 px-3 pt-2" onSubmit={revise}>
                <textarea
                  aria-label="What should change in the plan"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="what should change? the agent edits the draft's files; re-chunk after"
                  className="ins-well resize-y px-2 py-1 text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                />
                <span className="flex justify-end gap-1">
                  <PanelButton variant={stale ? 'default' : undefined} disabled={splitting || busy} onClick={rechunkPlan} title="Split again from the draft's files as they are now (r)">re-chunk</PanelButton>
                  <PanelButton type="submit" variant="outline" disabled={!notes.trim() || busy}>revise</PanelButton>
                </span>
              </form>
            </Group>
          )}
        </div>

        {folder && !showPicker && (
          <footer className="flex shrink-0 items-center gap-3 px-3 py-2.5 edge-t-engraved">
            {plan ? (
              <>
                <PanelButton variant="destructive" onClick={cancel} title="Cancel the plan; it stays in the plans pane, tucked with the finished ones (undo from the toast)">
                  cancel plan
                </PanelButton>
                <span className="ml-auto truncate text-[11px] text-muted-foreground">{stale ? 're-chunk (r) first: the draft changed' : 'goes to the plans pane as pending'}</span>
                <PanelButton variant="default" disabled={!canApprovePlan || busy} onClick={approvePlan}>approve plan</PanelButton>
              </>
            ) : (
              <>
                <span className="truncate text-[11px] text-muted-foreground">
                  {!repoRoot ? 'not tied to a repo: approve it from the project tab it is for'
                    : !hasParts ? 'draft a part first'
                      : mockupMissing ? 'ui.md doesn\'t link its mockup yet (m to skip the mockup)'
                        : `joins ${files.length} files, then splits them into chunks`}
                </span>
                <PanelButton variant="default" className="ml-auto" disabled={!canApproveDraft} onClick={approveDraft}>approve draft</PanelButton>
              </>
            )}
          </footer>
        )}
      </div>
      <span className="tui-pane-info tui-frame-hints">
        <FrameHints hints={hints} />
      </span>
    </div>
  );
}

/**
 * The draft's files on one spine: a row per part (written, sent to the agent,
 * or not yet), then any other .md files. Folded once the draft has a plan; a
 * part redrafted then needs a re-chunk.
 */
function PartsGroup({
  folded, files, extras, names, sent, agent, written, inContext, selectedFiles, addFiles, removeFile,
  mockup, onMockup, onDraft, onDraftAll, onOpen, cursorProps,
}) {
  const [open, setOpen] = useState(!folded);
  const [extra, setExtra] = useState('');
  useEffect(() => setOpen(!folded), [folded]);
  // Parts are optional: a plan has only the parts its work has, so no "of 4".
  const end = inContext > 0 ? `${written + extras.length} written · ${inContext} in context` : `${written + extras.length} written`;
  const addPart = (e) => {
    e.preventDefault();
    const part = slugify(extra).replace(/-/g, '_');
    if (!part) return;
    onDraft(part);
    setExtra('');
  };

  const contextBox = (path) => (
    <Checkbox
      checked={selectedFiles.has(path)}
      onCheckedChange={(on) => (on ? addFiles([path]) : removeFile(path))}
      aria-label={`Add ${basename(path)} to the context`}
      title="Attach to your next prompt"
    />
  );

  return (
    <Group label="parts" end={end}>
      {folded && (
        <button type="button" className="tui-btn mx-3 self-start text-[11px]" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'fold parts' : 'show parts'}
        </button>
      )}
      {open && (
        <div className="flex flex-col">
          {/* Column heads, as in a table: what the box column means, and the opinionated way to fill every row. */}
          <div className={cn(PART_ROW, 'items-center text-[11px] text-muted-foreground')}>
            <span />
            <span />
            <span aria-hidden="true" className="justify-self-center" title="Attach to your next prompt">ctx</span>
            {!folded && (
              <PanelButton variant="outline" className="justify-self-start" onClick={onDraftAll} title={`Ask this tab's agent to write all ${DRAFT_PARTS.length} parts in order, asking you what it needs first (D)`}>
                draft all
              </PanelButton>
            )}
          </div>
          {DRAFT_PARTS.map((part) => {
            const path = files.find((f) => basename(f) === `${part.id}.md`);
            const done = names.includes(`${part.id}.md`);
            // Sent and not written yet: live while the agent works on it.
            const asked = !done && sent.has(part.id);
            const body = done ? 'done' : asked ? (agent === 'working' ? 'live' : 'next') : 'queued';
            const label = done ? `${part.id}.md written` : asked ? `${part.id}.md asked for` : `${part.id}.md not written`;
            // The agent stopped on a part it was asked for: it is asking you something in the terminal.
            const yourTurn = asked && (agent === 'waiting' || agent === 'permission');
            return (
              <div key={part.id} data-body={body} className="ins-spine relative">
                <div {...cursorProps(part.id)} className={PART_ROW}>
                  <span className="flex h-5 w-3.5 items-center justify-center">
                    {yourTurn ? <Lamp state="wait" label={`${part.id}.md: the agent is waiting on you`} /> : <ChunkBody body={body} label={label} />}
                  </span>
                  <span className="flex min-w-0 items-baseline gap-2 leading-5">
                    {asked ? (
                      // The part being written, set like the live chunk in the plans pane.
                      <span className="ins-name text-[16px] leading-5 text-foreground">{part.label}</span>
                    ) : done ? (
                      <button type="button" className="font-medium text-foreground outline-none focus-visible:text-[var(--ins-legend)]" onClick={() => onOpen(path)} aria-label={`${part.id}.md`} title="Read it (^[ / ^] to step through the draft)">
                        {part.label}
                      </button>
                    ) : (
                      <span className="font-medium text-muted-foreground">{part.label}</span>
                    )}
                    <span className="truncate text-[11px] text-muted-foreground">{yourTurn ? 'your turn: answer in the terminal ←' : asked ? 'being written' : part.note}</span>
                    {part.id === 'ui' && (
                      <button
                        type="button"
                        className="tui-btn shrink-0 text-[11px]"
                        aria-pressed={mockup}
                        onClick={onMockup}
                        title={mockup ? 'The agent also makes an artifact mockup of the UI; click to skip it (m)' : 'Also ask the agent for an artifact mockup of the UI (m)'}
                      >
                        {mockup ? 'mockup: on' : 'mockup: off'}
                      </button>
                    )}
                  </span>
                  <span className="flex h-5 items-center justify-center">{done && contextBox(path)}</span>
                  <PanelButton className="justify-self-start" onClick={() => onDraft(part.id)} title={`Ask this tab's agent to ${done ? 'rewrite' : 'write'} ${part.id}.md (d)`}>
                    {done ? 'redraft' : 'draft'}
                  </PanelButton>
                </div>
              </div>
            );
          })}
          {extras.map((path) => (
            <div key={path} data-body="done" className="ins-spine relative">
              <div {...cursorProps(path)} className={PART_ROW}>
                <span className="flex h-5 w-3.5 items-center justify-center"><ChunkBody body="done" label={`${basename(path)} written`} /></span>
                <button type="button" className="min-w-0 truncate text-left text-foreground outline-none focus-visible:text-[var(--ins-legend)]" onClick={() => onOpen(path)} aria-label={basename(path)} title="Read it (^[ / ^] to step through the draft)">
                  {basename(path)}
                </button>
                <span className="flex h-5 items-center justify-center">{contextBox(path)}</span>
              </div>
            </div>
          ))}
          <form onSubmit={addPart} className="flex items-center gap-1.5 px-3 pt-1">
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="+ part: another file this plan needs (e.g. migration, testing)"
              aria-label="Another part to draft"
              className="ins-well h-7 min-w-0 flex-1 px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <PanelButton type="submit" variant="outline" disabled={!slugify(extra)}>draft</PanelButton>
          </form>
        </div>
      )}
    </Group>
  );
}
