import { useEffect, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Keycap, KeyChord } from '../components/instrument/Keycap';
import { Lamp, JOB_LAMP } from '../components/instrument/Lamp';
import { Meter } from '../components/instrument/Meter';
import { ContextMoon } from '../components/instrument/ContextMoon';
import { Scanner } from '../components/instrument/Scanner';
import { ToggleSwitch } from '../components/instrument/ToggleSwitch';
import { PanelButton } from '../components/instrument/PanelButton';
import { Button } from '../components/ui/button';
import { Send, JournalPage, Refresh } from 'iconoir-react';
import { PaneLegend } from '../components/instrument/PaneLegend';
import { DiffBar } from '../components/instrument/DiffBar';
import { LirahMark, LirahLockup } from '../components/LirahMark';
import { Checkbox } from '../components/ui/checkbox';
import { HoldButton } from '../components/instrument/HoldButton';
import { Detent } from '../components/instrument/Detent';
import { StepSlider } from '../components/instrument/StepSlider';
import { SegmentBank } from '../components/instrument/SegmentBank';
import { SplitKey } from '../components/instrument/SplitKey';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../components/ui/dialog';
import { TabRow } from '../features/tabs/TabRow';
import { TabProvider } from '../features/tabs/TabContext';
import { ContextChips } from '../components/textarea-panel/ContextChips';
import { SelectedFileItem } from '../components/textarea-panel/SelectedFileItem';
import { TreeGuide } from '../components/file-tree/TreeGuide';
import { AgentMark } from '../components/file-tree/AgentMark';
import { EmptyPlate } from '../components/EmptyState';

// Kit-only tab rows: live, waiting on you, resting (folded) and a plain shell.
const NOOP = () => {};
const KIT_DRAG = { dragIndex: -1, dropLineAt: () => null, onDragStart: NOOP, onDragOver: NOOP, onDrop: NOOP, endDrag: NOOP };
const KIT_ACTIONS = new Proxy({}, { get: () => NOOP });
const KIT_TABS = [
  { name: 'acme-api', agent: 'claude', kind: 'working', label: 'claude editing limiter.ts', fill: 0.41, info: { branch: 'feat/rate-limit', files: 3, added: 84, deleted: 12 }, active: true },
  { name: 'acme-web', agent: 'opencode', kind: 'permission', label: 'opencode needs permission', question: 'run the migration now?', since: '2m', fill: 0.66, info: { branch: 'main', files: 0 }, queuePos: 0 },
  { name: 'acme-db', agent: 'claude', kind: 'waiting', label: 'claude waiting', fill: 0.12, info: { branch: 'main', files: 0 }, compact: true },
  { name: 'infra', kind: 'idle', label: 'idle', info: { branch: 'ops', files: 1, added: 2, deleted: 0 } },
];

// Kit-only file tree rows (depth, name, agent mark) and plan chunks (body, title).
const KIT_TREE = [[0, 'src/', null], [1, 'limiter.ts', 'edit-live'], [1, 'schema.ts', 'edit'], [1, 'login.ts', 'read-live'], [1, 'routes.ts', 'read'], [0, 'README.md', null]];
const KIT_CHUNKS = [['done', 'Bundle fonts'], ['done', 'Reticle Lamp'], ['live', 'Orbit Scanner'], ['queued', 'Pane legends'], ['queued', 'Status rail', true]];

// Component sheet for the orrery-plate primitives. Mounted
// instead of the app when the URL carries `?kit` (dev only, see main.jsx).
// Three attached files, one per intent, with made-up level sizes.
const KIT_FILES = ['/p/src/db/schema.ts', '/p/src/auth/login.ts', '/p/src/limiter.ts'];
const KIT_STATES = new Map([[KIT_FILES[1], 'do-not-modify'], [KIT_FILES[2], 'use-as-example']]);
const KIT_SIZES = { [KIT_FILES[0]]: [420, { whole: 12600, signatures: 2100, skeleton: 900 }], [KIT_FILES[1]]: [80, { whole: 400 }], [KIT_FILES[2]]: [120, { whole: 1100 }] };
const KIT_SYMBOLS = {
  getLevelTokens: (f) => KIT_SIZES[f]?.[1] ?? null,
  getLineCount: (f) => KIT_SIZES[f]?.[0] ?? 0,
  getFileViewMode: () => 'signatures',
};
const KIT_REPOS = [{ key: 'r', tag: 'repo', name: 'acme-web', onRemove: () => {} }];

export function InstrumentKit() {
  const { currentTheme, themes, changeTheme } = useTheme();
  const [sandbox, setSandbox] = useState(true);
  const [net, setNet] = useState(false);
  const [latch, setLatch] = useState(true);
  const [ctx, setCtx] = useState(48200);
  const [check, setCheck] = useState(true);
  const [range, setRange] = useState('weekly');
  const [detail, setDetail] = useState('signatures');
  const [scroll, setScroll] = useState(10000);
  // `?kit&dialog` opens the sample dialog for screenshots.
  const [dialog, setDialog] = useState(() => new URLSearchParams(window.location.search).has('dialog'));

  // `?kit&theme=orrery` picks the theme for headless screenshots.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('theme');
    if (t && themes[t]) changeTheme(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-[var(--ins-gutter)] p-4 text-xs font-mono text-foreground">
      <div className="mb-4 flex items-center gap-3">
        <span className="ins-legend">Orrery kit</span>
        <select
          value={currentTheme}
          onChange={(e) => changeTheme(e.target.value)}
          className="ins-well px-2 py-1 text-foreground"
        >
          {Object.entries(themes).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <section className="tui-pane px-3" data-legend>
          <PaneLegend index={1} title="Keycaps" />
          <div className="flex flex-wrap items-center gap-2 py-2">
            <Keycap>1</Keycap>
            <Keycap lit>2</Keycap>
            <Keycap down>3</Keycap>
            <Keycap size="sm">/</Keycap>
            <KeyChord keys={['^', '⇧', 'P']} label="palette" />
            <KeyChord keys={['^', '↵']} label="send" lit />
          </div>
        </section>

        <section className="tui-pane px-3" data-legend tabIndex={0}>
          <PaneLegend index={2} title="Lamps" note="focus me" />
          <div className="flex flex-wrap items-center gap-3 py-2">
            {['off', 'on', 'ok', 'warn', 'fault'].map((s) => (
              <span key={s} className="flex items-center gap-1.5"><Lamp state={s} />{s}</span>
            ))}
            <span className="flex items-center gap-1.5"><Lamp state="on" blink />blink</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 pb-2">
            {Object.entries(JOB_LAMP).map(([status, l]) => (
              <span key={status} className="flex items-center gap-1.5"><Lamp {...l} />{status}</span>
            ))}
          </div>
        </section>

        <section className="tui-pane px-3" data-legend>
          <PaneLegend index={3} title="Meter" />
          <div className="flex flex-col gap-2 py-2">
            <Meter value={ctx} max={200000} label="Context" />
            <Meter value={170000} max={200000} label="Context warn" />
            <Meter value={196000} max={200000} label="Context fault" />
            <div className="flex items-center gap-3">
              {[0.05, ctx / 200000, 0.5, 0.75, 0.86, 0.97].map((r, i) => <ContextMoon key={i} ratio={r} />)}
              <Scanner size="sm" label="Working" />
              <Scanner size="md" label="Working" />
              <Scanner size="lg" label="Working" />
            </div>
            <input type="range" min={0} max={200000} value={ctx} onChange={(e) => setCtx(+e.target.value)} />
          </div>
        </section>

        <section className="tui-pane px-3" data-legend>
          <PaneLegend index={4} title="Switches" />
          <div className="flex items-center gap-4 py-2">
            <span className="flex items-center gap-1.5">
              <span className="ins-legend">Sandbox</span>
              <ToggleSwitch checked={sandbox} onChange={setSandbox} label="Sandbox" />
            </span>
            <span className="flex items-center gap-1.5">
              <span className="ins-legend">Net</span>
              <ToggleSwitch checked={net} onChange={setNet} label="Network" tone="warn" disabled={!sandbox} />
            </span>
            <PanelButton icon={JournalPage} latched={latch} onClick={() => setLatch((v) => !v)}>md</PanelButton>
            <PanelButton icon={Refresh} aria-label="Sync" />
            <PanelButton disabled>off</PanelButton>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <Button size="xs" className="gap-1 px-1.5"><Send className="h-3 w-3" />send</Button>
            <Button variant="ghost" size="xs">ghost</Button>
            <Button variant="secondary" size="xs">secondary</Button>
            <Button variant="outline" size="sm">outline</Button>
            <Button variant="destructive" size="xs">delete</Button>
            <Button variant="ghost" size="xs" aria-pressed="true">pressed</Button>
            <Button variant="link" size="xs">link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-2">
            {['xs', 'sm', 'default', 'lg'].map((size) => (
              <Button key={size} size={size}>{size}</Button>
            ))}
            {['xs', 'sm', 'default', 'lg'].map((size) => (
              <Button key={size} variant="ghost" size={size}>{size}</Button>
            ))}
            {['icon-xs', 'icon-sm', 'icon', 'icon-lg'].map((size) => (
              <Button key={size} variant="ghost" size={size} aria-label={size}><Refresh /></Button>
            ))}
            <Button disabled>disabled</Button>
            <Button variant="ghost" disabled>disabled</Button>
          </div>
        </section>

        <section className="tui-pane px-3" data-legend>
          <PaneLegend index={5} title="Diff bars" />
          <div className="flex flex-col items-start gap-2 py-2">
            <DiffBar added={12} removed={3} />
            <DiffBar added={140} removed={60} />
            <DiffBar added={4200} removed={900} />
          </div>
        </section>

        <section className="tui-pane px-3" data-legend>
          <PaneLegend index={6} title="Screen + well" />
          <div className="flex flex-col gap-2 py-2">
            <div className="ins-glass h-16 p-2 text-[var(--color-foreground)]">$ cargo test</div>
            <div className="ins-well px-2 py-1.5"><span className="text-[var(--ins-lamp)]">❯</span> prompt well</div>
          </div>
        </section>

        <section className="tui-pane px-3" data-legend>
          <PaneLegend index={8} title="Controls" />
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-wrap items-center gap-4">
              <SplitKey onClick={() => {}} onChoose={() => {}} chooseLabel="Choose agent">▶ Launch Claude Code</SplitKey>
              <HoldButton onConfirm={() => {}} onFallback={() => {}}>hold to delete</HoldButton>
              <span className="flex items-center gap-1.5"><Checkbox checked={check} onCheckedChange={setCheck} id="kit-check" /><label htmlFor="kit-check">keep</label></span>
            </div>
            <SegmentBank label="Range" value={range} onChange={setRange} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
            <Detent label="Detail level" value={detail} onChange={setDetail} options={[{ value: 'symbols', label: 'symbols' }, { value: 'signatures', label: 'signatures' }, { value: 'skeleton', label: 'skeleton' }]} className="max-w-[240px]" />
            <StepSlider label="Scrollback" value={scroll} onChange={setScroll} warnFrom={2} steps={[{ value: 1000, label: '1,000 lines', short: '1k' }, { value: 10000, label: '10,000 lines', short: '10k' }, { value: 50000, label: '50,000 lines', short: '50k' }, { value: 200000, label: '200,000 lines', short: '200k' }]} />
          </div>
        </section>

        <section className="tui-pane px-3" data-legend>
          <PaneLegend index={9} title="Tooltips" note="hover" />
          <div className="flex flex-wrap items-center gap-3 py-2">
            <Tooltip defaultOpen>
              <TooltipTrigger asChild><Button variant="ghost" size="xs">plate</Button></TooltipTrigger>
              <TooltipContent side="bottom" title="Detail level" fig="12">Signatures only · 3.1k tokens</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild><Button variant="ghost" size="xs">plain</Button></TooltipTrigger>
              <TooltipContent>Change CLI tool (Ctrl+K)</TooltipContent>
            </Tooltip>
            <span title={'Orrery redesign\nOpen the plan'} className="underline decoration-dotted">native title</span>
            <span title="Settings and quick actions" className="underline decoration-dotted">native, one line</span>
          </div>
        </section>

        <section className="tui-pane px-3" data-legend>
          <PaneLegend index={10} title="Dialog" />
          <div className="py-2">
            <Button variant="ghost" size="xs" onClick={() => setDialog(true)}>open dialog</Button>
            <Dialog open={dialog} onOpenChange={setDialog}>
              <DialogContent size="sm" keys={['^', 'T']} status="3 of 12" fig="03" hints={[{ keys: ['↑', '↓'], label: 'move' }, { keys: ['↵'], label: 'open' }]}>
                <DialogTitle>New tab</DialogTitle>
                <DialogDescription>Pick a project to open in a new tab.</DialogDescription>
                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setDialog(false)}>cancel</Button>
                  <Button size="sm" onClick={() => setDialog(false)}>open</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        <section className="tui-pane max-w-[320px]" data-legend>
          <PaneLegend index={11} title="Tabs" note="ledger" />
          <TabProvider>
          <div role="listbox" aria-label="Tabs" className="flex flex-col py-1">
            {KIT_TABS.map((t, i) => (
              <TabRow
                key={t.name}
                tab={{ id: t.name, projectPath: `/home/you/${t.name}` }}
                index={i}
                name={t.name}
                info={t.info}
                contextFill={t.fill ?? null}
                activityKind={t.kind}
                activityLabel={t.label}
                activitySince={t.since}
                activityQuestion={t.question}
                agent={t.agent}
                active={!!t.active}
                closable
                queuePos={t.queuePos ?? -1}
                compact={!!t.compact}
                drag={KIT_DRAG}
                actions={KIT_ACTIONS}
              />
            ))}
          </div>
          </TabProvider>
        </section>

        <section className="tui-pane px-3 max-w-[420px]" data-legend>
          <PaneLegend index={12} title="Context" note="chips" />
          <div className="flex flex-col gap-2 py-2">
            <ContextChips size="md" selectedFiles={KIT_FILES} fileStates={KIT_STATES} currentPath="/p" fileSymbols={KIT_SYMBOLS} onSetFileState={() => {}} onRemoveFile={() => {}} />
            <ContextChips selectedFiles={[]} currentPath="/p" extras={KIT_REPOS} />
            <div role="list" className="w-[260px]">
              {KIT_FILES.map((f) => (
                <SelectedFileItem
                  key={f}
                  file={{ absolute: f, name: f.split('/').pop() }}
                  currentState={KIT_STATES.get(f) || 'modify'}
                  onSetFileState={() => {}}
                  onRemoveFile={() => {}}
                  lineCount={KIT_SIZES[f][0]}
                  viewModeLabel="Signatures"
                  viewMode="signatures"
                  levelTokens={KIT_SIZES[f][1]}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="tui-pane max-w-[260px]" data-legend>
          <PaneLegend index={13} title="Files" note="guides · agent marks" />
          <div className="flex flex-col py-1 text-[var(--font-lg)]">
            {KIT_TREE.map(([depth, name, mark]) => (
              <div key={name} className="flex h-6 items-center gap-0.5 pr-2">
                <TreeGuide depth={depth} />
                <span className="w-3 shrink-0" />
                <span className="truncate pl-1">{name}</span>
                {mark && <span className="ml-auto pl-1.5 flex items-center"><AgentMark mark={mark} /></span>}
              </div>
            ))}
          </div>
        </section>

        <section className="tui-pane max-w-[260px]" data-legend>
          <PaneLegend index={14} title="Plans" note="chunk spine" />
          <div className="flex flex-col py-1">
            {KIT_CHUNKS.map(([body, title, skipped], i) => (
              <div key={title} data-body={body} className="ins-spine relative">
                <div className="grid grid-cols-[14px_16px_minmax(0,1fr)] items-start gap-x-1.5 px-3 py-[3px] text-[11px]">
                  <span className="flex h-[18px] w-3.5 items-center justify-center">
                    <span className="ins-body ins-round" data-body={body} data-skipped={skipped || undefined} role="img" aria-label={body} />
                  </span>
                  <span className="text-right leading-[18px] text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className={`leading-[18px] ${body === 'live' ? 'ins-name text-[12px]' : body === 'done' ? 'text-muted-foreground' : skipped ? 'text-muted-foreground line-through' : ''}`}>{title}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="tui-pane px-3" data-legend>
          <PaneLegend index={15} title="Empty" note="orbit plate" />
          <EmptyPlate className="py-4" title="No tasks yet" description="Add one with the + key." action={{ label: 'add task', onClick: NOOP }} />
        </section>

        <section className="tui-pane px-3" data-legend>
          <PaneLegend index={7} title="Mark" />
          <div className="flex flex-wrap items-end gap-4 py-2">
            {[96, 48, 32, 24, 16].map((size) => <LirahMark key={size} size={size} title={`Lirah ${size}px`} />)}
            <LirahMark size={18} lit />
            <LirahLockup size={40} wordmarkSize={36} />
          </div>
        </section>
      </div>
    </div>
  );
}
