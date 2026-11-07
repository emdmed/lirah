import { useSyncExternalStore } from 'react';
import { Crown } from 'lucide-react';
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

// A worker node per agent state: filled ink while it works, warn while a
// permission prompt holds it, an ok outline when it's your turn, else empty.
const NODE_INK = {
  working: { fill: 'var(--color-foreground)', stroke: 'var(--color-foreground)', word: 'working' },
  permission: { fill: 'var(--ins-warn)', stroke: 'var(--ins-warn)', word: 'needs you' },
  waiting: { fill: 'var(--fig-paper, var(--ins-raised))', stroke: 'var(--ins-ok)', word: 'your turn' },
  done: { fill: 'var(--fig-paper, var(--ins-raised))', stroke: 'var(--ins-ok)', word: 'done' },
};
const NODE_IDLE = { fill: 'var(--fig-paper, var(--ins-raised))', stroke: 'var(--ins-edge-strong)', word: 'no agent' };

const NODE = 5;
const PITCH = 8;
const LEAD = 7; // from the hollow origin dot to the first drop
const MAX_NODES = 12;

// The master's workers as a fan-out in the figures' language: a leader from a
// hollow origin dot along a bus, one drop and node per tab. Hovering a node
// names the tab. Replaces "N workers".
function WorkerFan({ workers }) {
  const shown = workers.slice(0, MAX_NODES);
  const width = LEAD + Math.max(shown.length, 1) * PITCH;
  const busEnd = LEAD + (shown.length - 0.5) * PITCH;
  const hair = { stroke: 'var(--ins-faint)', strokeWidth: 1 };
  return (
    <svg width={width} height={13} viewBox={`0 0 ${width} 13`} className="shrink-0 overflow-visible" aria-hidden="true">
      <circle cx={2} cy={2} r={1.5} style={{ fill: 'var(--fig-paper, var(--ins-raised))', ...hair }} />
      {shown.length > 0 && <line x1={3.5} y1={2} x2={busEnd} y2={2} style={hair} />}
      {shown.map(({ name, state }, i) => {
        const cx = LEAD + i * PITCH + PITCH / 2;
        const ink = NODE_INK[state] ?? NODE_IDLE;
        return (
          <g key={i}>
            <title>{`${name}: ${ink.word}`}</title>
            <line x1={cx} y1={2} x2={cx} y2={7} style={hair} />
            <rect
              x={cx - NODE / 2 + 0.5}
              y={7.5}
              width={NODE - 1}
              height={NODE - 1}
              style={{ fill: ink.fill, stroke: ink.stroke, strokeWidth: 1, transition: 'fill var(--ins-cool) var(--ins-ease), stroke var(--ins-cool) var(--ins-ease)' }}
            />
          </g>
        );
      })}
    </svg>
  );
}

// The workspace's master terminal, one tier above its tabs: a band on the
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
        'flex h-9 shrink-0 items-center gap-2 pl-3 pr-2 edge-b-engraved text-[11px]',
        'transition-[background-color] duration-[var(--ins-dur-base)] ease-[var(--ins-ease)]',
        showing ? 'bg-[color-mix(in_srgb,var(--color-foreground)_8%,var(--ins-raised))]' : 'bg-[var(--ins-raised)]',
      )}
    >
      {/* The tab rows' 16px icon column, so the crown sits over their lamps and
          MASTER starts on their names' line (12 + 16 + 8 = 36px). */}
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
      <span className="engraved-label shrink-0 text-foreground">master</span>
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-muted-foreground">
        <WorkerFan workers={workers} />
        {n > MAX_NODES && <span className="tabular-nums">+{n - MAX_NODES}</span>}
        {busy > 0 && <span className="truncate tabular-nums">{busy} working</span>}
        <span className="sr-only">drives {drives}{master && !live ? ', idle' : ''}</span>
      </span>
      {/* pl-2 keeps 16px between the fan and the status when the pane is narrow. */}
      <span role="status" className="ml-auto flex min-w-0 shrink items-center gap-1.5 pl-2 text-muted-foreground">
        {live && <Lamp state={live.lamp} blink={live.blink} />}
        {word && <span className="truncate">{word}</span>}
      </span>
      <PanelButton
        onClick={toggle}
        aria-pressed={showing}
        title={showing ? 'Back to the tabs' : `Show the master terminal (:master). It drives ${drives}.`}
        className="shrink-0"
      >
        {showing ? 'back' : master ? 'open' : 'start'}
      </PanelButton>
    </div>
  );
}
