import { useSyncExternalStore } from 'react';
import { CalRecipe } from '@/components/instrument/calibrated';
import { getAgentHookState, subscribeAgentHooks } from '../tabs/agentHookState';
import { getTabSession } from '../tabs/terminalActivity';
import { AUTOPILOT_STATUS, CHUNK_STATUS, HALT_REASON } from './planModel';
import { chunkTrailer } from './planPrompts';

// FIG.09: the auto-pilot loop as the calibrated loop recipe. Four stations
// clockwise from the top: IMPLEMENT (the agent's turn), CHECK (the commit
// search by trailer), NUDGE (once, only when the turn ended without a commit)
// and NEXT (the next chunk is sent). Stations already passed for this chunk
// are done, the one the run is at is the lamp star, and a paused or failed
// run marks where it stopped as a fault. The centre reads the chunk count.
// Compact shows `fallback`.

const IMPLEMENT = 0;
const CHECK = 1;
const NUDGE = 2;
const NEXT = 3;
const MIN_W = 360; // 86% of the recipe's 420

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

// One station on, clockwise (NEXT wraps to the next chunk's IMPLEMENT): play
// it as the recipe's step, the star riding the edge. Anything else redraws.
function stepForward(a, b) {
  if (a.at == null || b.at == null || b.at !== (a.at + 1) % 4) return null;
  return { ...b, from: a.at, lapFrom: a.lap, dir: 1 };
}

/** The loop drawn for a live run; `fallback` is what a narrow pane shows. */
export function Fig09Loop({ plan, pos, elapsed, fallback }) {
  const ap = plan.autopilot;
  const chunk = pos?.chunk;
  const agent = useTabAgentState(ap.tabId);
  const running = ap.status === AUTOPILOT_STATUS.RUNNING;
  const live = running ? liveStation(ap, chunk, agent) : null;
  const halted = running ? null : haltedStation(ap, chunk);
  const here = live ?? halted;

  // Passed this chunk: everything before where it is, and the nudge once sent.
  const passed = (i) => i !== here && (i === NUDGE ? ap.nudged : i < here);
  const state = (i) => (i === live ? 'live' : i === halted ? 'fault' : passed(i) ? 'done' : 'todo');

  const nextLabel = plan.clearBetweenChunks
    ? 'fresh context'
    : pos && pos.index < pos.total ? `chunk ${pos.index + 1}` : 'finish';
  const trailer = chunk ? chunkTrailer(plan, chunk) : 'Plan-Chunk: <plan>/<chunk>';

  const label = `${[
    'Auto-pilot loop',
    pos && `chunk ${pos.index} of ${pos.total}`,
    elapsed && `${elapsed} in`,
    here != null && `${running ? 'at' : 'stopped at'} ${['implement', 'check', 'nudge', 'next'][here]}`,
    ap.nudged && 'nudged once',
    `check runs git log --grep "${trailer}"`,
    `next: ${nextLabel}`,
  ].filter(Boolean).join(', ')}.`;

  const center = [pos ? `${pos.index}/${pos.total}` : 'starting', elapsed].filter(Boolean).join(' · ');
  const names = ['implement', 'check', 'nudge', `next · ${nextLabel}`];
  const cmds = [undefined, 'git log --grep', undefined, undefined];
  // Live: the recipe's step form (at = the station, one lap per chunk), so a
  // move to the next station plays as a step. The nudge stays open unless sent.
  // Stopped: explicit states, with a fault where it stopped.
  const data = running
    ? {
      center,
      at: live,
      lap: pos?.index ?? 1,
      laps: pos?.total,
      stations: names.map((name, i) => ({ name, cmd: cmds[i], skip: i === NUDGE && !ap.nudged })),
      label,
    }
    : {
      center,
      stations: names.map((name, i) => ({ name, cmd: cmds[i], state: state(i) })),
      label,
    };

  return (
    <div className="min-w-0" title={label}>
      <CalRecipe recipe="loop" title="AUTO-PILOT LOOP" data={data} transition={stepForward} minWidth={MIN_W} paper="var(--ins-well)" fallback={fallback} />
    </div>
  );
}
