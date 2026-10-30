import { useSyncExternalStore } from 'react';
import { DASH, Figure, INK, Node, STROKE, T, textWidth } from '@/components/instrument/figure';
import { getAgentHookState, subscribeAgentHooks } from '../tabs/agentHookState';
import { getTabSession } from '../tabs/terminalActivity';
import { AUTOPILOT_STATUS, CHUNK_STATUS, HALT_REASON, UNTITLED_PLAN } from './planModel';
import { chunkTrailer } from './planPrompts';

// FIG.09: the auto-pilot loop. Four stations on a circle, clockwise from the
// top: IMPLEMENT (the agent's turn), CHECK (the commit search by trailer),
// NUDGE (once, only when the turn ended without a commit) and NEXT (the next
// chunk is sent). The star sits on the station the run is at.

const IMPLEMENT = 0;
const CHECK = 1;
const NUDGE = 2;
const NEXT = 3;

const W = 400;
const H = 172;
const R = 44;
const CX = 146;
const CY = 98;
// Screen angles (y down), so clockwise is increasing.
const ANGLE = [-90, 0, 90, 180];
const at = (deg, r = R) => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)];

/** The agent state in the run's tab, re-read on every hook event. */
function useTabAgentState(tabId) {
  const read = () => getAgentHookState(getTabSession(tabId));
  return useSyncExternalStore(subscribeAgentHooks, read, read);
}

/**
 * Which station the run is at. Auto-pilot's own check isn't observable from
 * here, so CHECK is read as "the turn ended and the chunk is still in
 * progress": that is exactly when it runs.
 */
function liveStation(ap, chunk, agent) {
  if (!chunk || chunk.status !== CHUNK_STATUS.IN_PROGRESS) return NEXT; // between advance() calls
  // A turn that ended after the chunk (or its nudge) was sent.
  const since = ap.nudged ? ap.at : chunk.startedAt;
  if (agent?.state === 'done' && (!since || agent.at >= since)) return CHECK;
  return ap.nudged ? NUDGE : IMPLEMENT;
}

/** The station a paused or failed run stopped at, for its ×. */
function haltedStation(ap, chunk) {
  if (ap.reason === HALT_REASON.NO_COMMIT) return NUDGE;
  if (ap.reason === HALT_REASON.GIT_ERROR) return CHECK;
  if (ap.reason === HALT_REASON.SEND_FAILED) return ap.nudged ? NUDGE : NEXT;
  return chunk?.status === CHUNK_STATUS.IN_PROGRESS ? IMPLEMENT : NEXT;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// A quarter arc from station i to i+1, with a chevron at its middle.
function Arc({ from, color, dash, width = STROKE.hair }) {
  const [x0, y0] = at(ANGLE[from]);
  const [x1, y1] = at(ANGLE[from] + 90);
  const mid = ANGLE[from] + 45;
  const [mx, my] = at(mid);
  const rad = (mid * Math.PI) / 180;
  const tx = -Math.sin(rad);
  const ty = Math.cos(rad);
  const head = `M${mx + tx * 3} ${my + ty * 3}L${mx - tx * 2 - ty * 3} ${my - ty * 2 + tx * 3}L${mx - tx * 2 + ty * 3} ${my - ty * 2 - tx * 3}Z`;
  return (
    <g>
      <path
        d={`M${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}`}
        style={{ fill: 'none', stroke: color, strokeWidth: width, strokeDasharray: dash }}
      />
      <path d={head} style={{ fill: color }} />
    </g>
  );
}

function Cross({ x, y, s = 5 }) {
  return (
    <path
      d={`M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}`}
      style={{ stroke: INK.fault, strokeWidth: STROKE.heavy, strokeLinecap: 'round' }}
    />
  );
}

/** The loop drawn for a live run; `fallback` is what compact mode or a narrow pane shows. */
export function Fig09Loop({ plan, pos, elapsed, runLine, fallback }) {
  const ap = plan.autopilot;
  const chunk = pos?.chunk;
  const agent = useTabAgentState(ap.tabId);
  const running = ap.status === AUTOPILOT_STATUS.RUNNING;
  const live = running ? liveStation(ap, chunk, agent) : null;
  const halted = running ? null : haltedStation(ap, chunk);
  const here = live ?? halted;

  // Passed this chunk: everything before where it is, and the nudge once sent.
  const passed = (i) => i !== here && (i === NUDGE ? ap.nudged : i < here);
  const ink = (i) => passed(i) || i === here;

  const nextLabel = plan.clearBetweenChunks
    ? 'fresh context'
    : pos && pos.index < pos.total ? `chunk ${pos.index + 1}` : 'finish';
  const trailer = chunk ? chunkTrailer(plan, chunk) : 'Plan-Chunk: <plan>/<chunk>';

  const head = 'AUTO-PILOT · ';
  const room = Math.floor((W - textWidth('FIG.09', 0.5) - 8) / (textWidth('x', 0.5))) - head.length;
  const title = `${head}${clip((plan.title || UNTITLED_PLAN).toUpperCase(), room)}`;

  // Arcs: walked ones in ink; the nudge detour dashed when it was skipped.
  const arcColor = (i) => (ink(i) && ink((i + 1) % 4) && i !== NEXT ? INK.fg : INK.faint);
  const arcDash = (i) => ((i === CHECK || i === NUDGE) && !ap.nudged ? DASH.medium : undefined);

  const stations = [IMPLEMENT, CHECK, NUDGE, NEXT].map((i) => {
    const [x, y] = at(ANGLE[i]);
    let mark;
    if (i === live) mark = <Node x={x} y={y} state="live" size={7} />;
    else mark = <Node x={x} y={y} state={passed(i) ? 'done' : 'todo'} size={8} />;
    return (
      <g key={i}>
        {mark}
        {i === halted && <Cross x={x} y={y} />}
      </g>
    );
  });

  const nameColor = (i) => (ink(i) ? INK.fg : INK.muted);
  const [tx, ty] = at(ANGLE[IMPLEMENT]);
  const [rx, ry] = at(ANGLE[CHECK]);
  const [bx, by] = at(ANGLE[NUDGE]);
  const [lx, ly] = at(ANGLE[NEXT]);

  const label = [
    'Auto-pilot loop',
    pos && `chunk ${pos.index} of ${pos.total}`,
    here != null && `${running ? 'at' : 'stopped at'} ${['implement', 'check', 'nudge', 'next'][here]}`,
  ].filter(Boolean).join(', ');

  return (
    <Figure fig="autopilot" title={title} viewBox={`0 0 ${W} ${H}`} minWidth={330} fallback={fallback} label={label} paper="var(--ins-well)">
      <circle cx={CX} cy={CY} r={R} style={{ fill: 'none', stroke: INK.edge, strokeWidth: STROKE.hair }} />
      {[IMPLEMENT, CHECK, NUDGE, NEXT].map((i) => (
        <Arc key={i} from={i} color={arcColor(i)} dash={arcDash(i)} width={arcColor(i) === INK.fg ? STROKE.ink : STROKE.hair} />
      ))}
      {stations}

      {/* Centre: where in the plan. */}
      <T x={CX} y={CY + (elapsed ? -1 : 4)} anchor="middle" color={INK.fg}>
        {pos ? `chunk ${pos.index}/${pos.total}` : 'starting'}
      </T>
      {elapsed && <T x={CX} y={CY + 13} anchor="middle">{elapsed}</T>}

      {/* IMPLEMENT, above the top station. */}
      <T x={tx} y={ty - 10} anchor="middle" color={nameColor(IMPLEMENT)}>
        IMPLEMENT <tspan style={{ fill: INK.muted }}>· agent turn</tspan>
      </T>
      {/* CHECK, right: the search auto-pilot runs for the commit. */}
      <T x={rx + 12} y={ry - 12} color={nameColor(CHECK)}>CHECK</T>
      <T x={rx + 12} y={ry + 3}>$ git log --grep</T>
      <T x={rx + 12} y={ry + 17}>{`"${clip(trailer, 27)}"`}</T>
      {/* NUDGE, below the bottom station. */}
      <T x={bx} y={by + 20} anchor="middle" color={nameColor(NUDGE)}>
        NUDGE <tspan style={{ fill: INK.muted }}>· once, if no commit</tspan>
      </T>
      {/* NEXT, left. */}
      <T x={lx - 12} y={ly - 3} anchor="end" color={nameColor(NEXT)}>NEXT</T>
      <T x={lx - 12} y={ly + 11} anchor="end">{nextLabel}</T>

      {runLine && <T x={W} y={H - 4} anchor="end" color={INK.faint}>{runLine}</T>}
    </Figure>
  );
}
