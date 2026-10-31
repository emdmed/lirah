import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Keycap, KeyChord } from '../components/instrument/Keycap';
import { Lamp, JOB_LAMP } from '../components/instrument/Lamp';
import { Meter } from '../components/instrument/Meter';
import { ContextMoon } from '../components/instrument/ContextMoon';
import { Scanner } from '../components/instrument/Scanner';
import { ToggleSwitch } from '../components/instrument/ToggleSwitch';
import { PanelButton } from '../components/instrument/PanelButton';
import { Button } from '../components/ui/button';
import { Send } from 'lucide-react';
import { FileText, RefreshCw } from 'lucide-react';
import { PaneLegend } from '../components/instrument/PaneLegend';
import { DiffBar } from '../components/instrument/DiffBar';
import { LirahMark, LirahLockup } from '../components/LirahMark';
import { Checkbox } from '../components/ui/checkbox';
import { HoldButton } from '../components/instrument/HoldButton';
import { Detent } from '../components/instrument/Detent';
import { StepSlider } from '../components/instrument/StepSlider';
import { SegmentBank } from '../components/instrument/SegmentBank';
import { SplitKey } from '../components/instrument/SplitKey';

// Component sheet for the Instrument TUI primitives (board 01b). Mounted
// instead of the app when the URL carries `?kit` (dev only, see main.jsx).
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

  return (
    <div className="h-full overflow-y-auto bg-[var(--ins-gutter)] p-4 text-xs font-mono text-foreground">
      <div className="mb-4 flex items-center gap-3">
        <span className="ins-legend">Instrument kit</span>
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
          <PaneLegend index={2} title="Lamps" status="focus me" />
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
              <Scanner size="md" label="Working" />
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
            <PanelButton icon={FileText} latched={latch} onClick={() => setLatch((v) => !v)}>md</PanelButton>
            <PanelButton icon={RefreshCw} aria-label="Sync" />
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
