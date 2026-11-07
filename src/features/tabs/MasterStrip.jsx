import { useSyncExternalStore } from 'react';
import { Crown } from 'iconoir-react';
import { cn } from '@/lib/utils';
import { Lamp } from '../../components/instrument/Lamp';
import { PanelButton } from '../../components/instrument/PanelButton';
import { masterTabOf, tabDisplayName, useTabManager } from './TabContext';
import { getAgentHookState, getAgentHookVersion, subscribeAgentHooks } from './agentHookState';
import { getTabSession } from './terminalActivity';
import { useBookmarks } from '../bookmarks';

const agentState = (tab) => getAgentHookState(getTabSession(tab.id))?.state;

// Only live states light the lamp; resting ones are a word (DESIGN rule 4).
const MASTER_STATE = {
  working: { lamp: 'on', blink: true, word: 'working' },
  permission: { lamp: 'warn', word: 'needs you' },
};

// A worker node per agent state, in row order: filled ink while it
// works, a dashed warn frame while a permission prompt holds it, an ok outline
// when it's your turn, else an empty outline.
const NODE_INK = {
  working: { fill: 'var(--color-foreground)', stroke: 'var(--color-foreground)', word: 'working' },
  permission: { fill: 'none', stroke: 'var(--ins-warn)', word: 'needs you', frame: true },
  waiting: { fill: 'none', stroke: 'var(--ins-edge-strong)', word: 'idle' },
  done: { fill: 'none', stroke: 'var(--ins-ok)', word: 'your turn' },
};
const NODE_IDLE = { fill: 'none', stroke: 'var(--ins-edge-strong)', word: 'no agent' };

const NODE = 9;
const PITCH = 12;
const LEAD = 8; // from the hollow origin dot to the first node
const BUS_Y = 3;
const NODE_Y = 7;
const MAX_NODES = 8;
const ink = (t) => ({ transition: `${t} var(--ins-cool) var(--ins-ease)` });

// The master's workers as a fan-out in the figures' language: a leader from a
// hollow origin dot along a bus, one drop and node per tab row.
// Hovering a node names the tab. Replaces "N workers".
function WorkerFan({ workers }) {
  const shown = workers.slice(0, MAX_NODES);
  const width = LEAD + Math.max(shown.length, 1) * PITCH;
  const busEnd = LEAD + (shown.length - 1) * PITCH + NODE / 2;
  const hair = { stroke: 'var(--ins-faint)', strokeWidth: 1 };
  return (
    <svg width={width} height={18} viewBox={`0 0 ${width} 18`} className="shrink-0 overflow-visible" aria-hidden="true">
      <circle cx={2} cy={BUS_Y} r={1.75} style={{ fill: 'var(--ins-raised)', ...hair }} />
      {shown.length > 0 && <line x1={3.75} y1={BUS_Y} x2={busEnd} y2={BUS_Y} style={hair} />}
      {shown.map(({ name, state }, i) => {
        const x = LEAD + i * PITCH;
        const cx = x + NODE / 2;
        const k = NODE_INK[state] ?? NODE_IDLE;
        return (
          <g key={i}>
            <title>{`${name}: ${k.word}`}</title>
            <line x1={cx} y1={BUS_Y} x2={cx} y2={NODE_Y} style={hair} />
            <rect
              x={x + 0.5}
              y={NODE_Y + 0.5}
              width={NODE - 1}
              height={NODE - 1}
              style={{ fill: k.fill, stroke: k.stroke, strokeWidth: 1, ...ink('fill, stroke') }}
            />
            {k.frame && (
              <rect
                x={x - 1.5}
                y={NODE_Y - 1.5}
                width={NODE + 3}
                height={NODE + 3}
                style={{ fill: 'none', stroke: 'var(--ins-warn)', strokeWidth: 0.75, strokeDasharray: '1.5 1.5' }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// working / tabs as a boxed value on a short leader; the box inks up while
// any tab works. Hidden when the pane is too narrow to hold it.
function BusyBox({ busy, total }) {
  return (
    <span className="hidden shrink-0 items-center @[300px]:flex">
      <span className="h-px w-2.5 bg-[var(--ins-faint)]" />
      <span
        className={cn(
          'border px-[3px] leading-[13px] tabular-nums transition-colors duration-[var(--ins-cool)]',
          busy ? 'border-foreground text-foreground' : 'border-[var(--ins-edge-strong)] text-muted-foreground',
        )}
      >
        {busy}/{total}
      </span>
    </span>
  );
}

// The workspace terminal, one tier above its tabs: a band on the
// raised face between the Workspace legend and the tabs/jobs switch, 36px so
// its rule meets the files pane's header rule. Left, what it is and what it
// drives; right, how it is and the key that shows it (opened on first use).
export function MasterStrip() {
  const { tabs, workspaceTabs, activeWorkspaceId, activeTabId, openMaster, switchTab } = useTabManager();
  const { bookmarks } = useBookmarks();
  useSyncExternalStore(subscribeAgentHooks, getAgentHookVersion);
  const master = masterTabOf(tabs, activeWorkspaceId);
  const showing = !!master && master.id === activeTabId;
  const live = master ? MASTER_STATE[agentState(master)] : null;
  const workers = workspaceTabs.map((t) => ({ name: tabDisplayName(t, bookmarks), state: agentState(t) }));
  const busy = workers.filter((w) => w.state === 'working').length;
  const n = workers.length;
  const drives = `${n} ${n === 1 ? 'tab' : 'tabs'}${busy ? `, ${busy} working` : ''}`;
  // Resting prints nothing: the open key already says it's there.
  const word = live?.word ?? (master ? null : 'not started');

  const toggle = () => {
    if (showing && workspaceTabs[0]) switchTab(workspaceTabs[0].id);
    else openMaster();
  };

  return (
    <div
      className={cn(
        '@container flex h-9 shrink-0 items-center gap-2 pl-3 pr-2 edge-b-engraved text-[11px]',
        'transition-[background-color] duration-[var(--ins-dur-base)] ease-[var(--ins-ease)]',
        showing ? 'bg-[color-mix(in_srgb,var(--color-foreground)_8%,var(--ins-raised))]' : 'bg-[var(--ins-raised)]',
      )}
    >
      {/* The tab rows' 16px icon column, so the crown sits over their lamps and
          the label starts on their names' line (12 + 16 + 8 = 36px). */}
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
        <Crown
          strokeWidth={1.75}
          className={cn(
            'h-3.5 w-3.5 transition-colors',
            // Lamps warm fast and cool slowly.
            live ? 'text-[var(--ins-lamp)] duration-[var(--ins-warm)]' : 'text-foreground duration-[var(--ins-cool)]',
          )}
        />
      </span>
      {/* The pane's legend already says workspace. */}
      <span className="engraved-label shrink-0 text-foreground">
        <span className="hidden @[300px]:inline">terminal</span>
        <span className="@[300px]:hidden">term</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <WorkerFan workers={workers} />
        {n > MAX_NODES && <span className="tabular-nums">+{n - MAX_NODES}</span>}
        <span className="sr-only">workspace terminal, drives {drives}{master && !live ? ', idle' : ''}</span>
      </span>
      <BusyBox busy={busy} total={n} />
      {/* The lamp and lit crown carry live state; its word is for readers only,
          so the fan and box keep the room. */}
      <span role="status" className="ml-auto flex min-w-0 shrink items-center gap-1.5 pl-2 text-muted-foreground">
        {live && <Lamp state={live.lamp} blink={live.blink} />}
        {word && <span className={cn('truncate', live && 'sr-only')}>{word}</span>}
      </span>
      <PanelButton
        onClick={toggle}
        aria-pressed={showing}
        title={showing ? 'Back to the tabs' : `Show the workspace terminal (:master). It drives ${drives}.`}
        className="shrink-0"
      >
        {showing ? 'back' : master ? 'open' : 'start'}
      </PanelButton>
    </div>
  );
}
