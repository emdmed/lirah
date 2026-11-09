import { useEffect, useState, useSyncExternalStore } from 'react';
import { listen } from '@tauri-apps/api/event';
import { git } from '../../lib/git';
import { CalRecipe } from '@/components/instrument/calibrated';
import { getAgentHookState, subscribeAgentHooks } from '../tabs/agentHookState';
import { getTabSession } from '../tabs/terminalActivity';
import { AUTOPILOT_STATUS, CHUNK_STATUS, HALT_REASON } from './planModel';
import { chunkTrailer } from './planPrompts';
import { planGit, workPath } from './planGit';

// FIG.09: the auto-pilot loop as Lirah's loopPlate recipe, a compact
// strong-weight schematic (components/instrument/calibrated/recipes). Four
// stations clockwise from the top: IMPLEMENT (the agent's turn), CHECK (the
// commit search by trailer), NUDGE (once, only when the turn ended without a
// commit) and NEXT (the next chunk is sent). Stations already passed for this
// chunk are done, the one the run is at is lit and named with its clock, and
// a paused or failed run marks where it stopped as a fault. Under it, the
// run's newest commit as it lands. Compact or narrow shows `fallback`.

const IMPLEMENT = 0;
const CHECK = 1;
const NUDGE = 2;
const NEXT = 3;
const MIN_W = 360; // 79% of the plate's 456

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

/**
 * The run's newest commit ({ sha, subject } or null): the latest in the plan's
 * work dir carrying its trailer, from this chunk or an earlier one. Re-read
 * when `refresh` changes (a turn ends, a chunk moves) and when the commit
 * watcher sees one land there.
 */
function useRunCommit(plan, refresh) {
  const cfg = planGit(plan);
  // shortcut: a multi-repo plan reads only its first repo; read every repo if the line misses commits there.
  const dir = cfg.repos.length > 1 ? workPath(cfg.repos[0]) : cfg.workDir;
  const [seen, setSeen] = useState(0);
  const [commit, setCommit] = useState(null);

  useEffect(() => {
    const off = listen('commit-detected', (e) => { if (e.payload?.repo_path === dir) setSeen((n) => n + 1); });
    return () => { off.then((un) => un()); };
  }, [dir]);

  useEffect(() => {
    let stale = false;
    git(dir, ['log', '-1', '--format=%h%x09%s', '--fixed-strings', `--grep=Plan-Chunk: ${plan.id}/`])
      .then((out) => {
        if (stale) return;
        const [sha, ...subject] = out.trim().split('\t');
        setCommit(sha ? { sha, subject: subject.join('\t') } : null);
      })
      .catch(() => { if (!stale) setCommit(null); });
    return () => { stale = true; };
  }, [dir, plan.id, refresh, seen]);

  return commit;
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

  const commit = useRunCommit(plan, `${chunk?.id}:${chunk?.status}:${agent?.at}`);
  // The nudge is skipped unless it was sent; the rest is passed, here, or ahead.
  const states = [IMPLEMENT, CHECK, NUDGE, NEXT].map((i) => {
    if (i === here) return running ? 'live' : 'fault';
    if (i === NUDGE && !ap.nudged) return 'skip';
    return here != null && i < here ? 'done' : 'todo';
  });
  const data = {
    states,
    clock: running ? elapsed : null,
    centre: pos ? `${pos.index}/${pos.total}` : '–',
    commit,
    label: `${label}${commit ? ` Latest commit ${commit.sha}: ${commit.subject}.` : ''}`,
  };

  return (
    <div className="min-w-0" title={label}>
      <CalRecipe recipe="loopPlate" data={data} minWidth={MIN_W} paper="var(--ins-well)" fallback={fallback} />
    </div>
  );
}
