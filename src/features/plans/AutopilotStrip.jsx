import { formatDuration } from '../../lib/formatDuration';
import { Eye, Play, Square, SquareTerminal } from 'lucide-react';
import { Lamp } from '../../components/instrument/Lamp';
import { PanelButton } from '../../components/instrument/PanelButton';
import { AUTOPILOT_LAMP, Prose } from './parts';
import { useTick } from '../../hooks/useTick';
import { useSetting } from '../settings/settingsStore';
import { Fig09Loop } from './Fig09Loop';
import { Fig20Timeline } from './Fig20Timeline';
import { AUTO_RESUME_REASONS, AUTOPILOT_STATUS, CHUNK_STATUS, pilotPosition } from './planModel';

/** Where the auto-pilot run stands, and what you can do about it. */
export function AutopilotStrip({ plan, tabOpen, busy, options, onResume, onStop, onDismiss, onGoToTab, onReviewAll }) {
  const ap = plan.autopilot;
  const running = ap.status === AUTOPILOT_STATUS.RUNNING;
  const now = useTick(running);
  const [figures] = useSetting('figures');
  // Counted like the progress readout: skipped chunks are left out.
  const pos = pilotPosition(plan);
  const chunk = pos?.chunk;
  const at = pos ? `chunk ${pos.index} of ${pos.total}` : null;
  const elapsed = running && chunk?.status === CHUNK_STATUS.IN_PROGRESS && chunk.startedAt ? formatDuration(now - chunk.startedAt) : null;
  const took = ap.startedAt && ap.endedAt ? formatDuration(ap.endedAt - ap.startedAt) : null;
  // The run as a whole: how long it has gone, and what's left after this chunk.
  const counted = plan.chunks.filter((c) => c.status !== CHUNK_STATUS.SKIPPED);
  const left = counted.filter((c) => c.status !== CHUNK_STATUS.IMPLEMENTED && c.id !== chunk?.id).length;
  const runFor = running && ap.startedAt ? formatDuration(now - ap.startedAt) : null;
  const runLine = [runFor && `run ${runFor}`, `${left} left`].filter(Boolean).join(' · ');
  // What a finished run leaves behind, counted.
  const commits = plan.chunks.reduce((n, c) => n + (c.commits?.length ?? 0), 0);
  const skipped = plan.chunks.length - counted.length;
  const tally = [
    `${counted.filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED).length} chunks`,
    `${commits} ${commits === 1 ? 'commit' : 'commits'}`,
    skipped > 0 && `${skipped} skipped`,
  ].filter(Boolean).join(' · ');
  const headline = {
    [AUTOPILOT_STATUS.RUNNING]: at ? [at, elapsed, ap.nudged && 'nudged to commit'].filter(Boolean).join(' · ') : 'starting',
    [AUTOPILOT_STATUS.PAUSED]: ['needs you', at].filter(Boolean).join(' · '),
    [AUTOPILOT_STATUS.FAILED]: ['error', at].filter(Boolean).join(' · '),
    // Full figures: the timeline below carries the run's time.
    [AUTOPILOT_STATUS.DONE]: ['plan complete', figures === 'compact' && took && `in ${took}`].filter(Boolean).join(' '),
    [AUTOPILOT_STATUS.OFF]: 'off',
  }[ap.status] || ap.status;
  const lamp = AUTOPILOT_LAMP[ap.status] || AUTOPILOT_LAMP[AUTOPILOT_STATUS.PAUSED];
  const live = running || ap.status === AUTOPILOT_STATUS.PAUSED || ap.status === AUTOPILOT_STATUS.FAILED;
  // A settled run is a line, not a box: only a live one should pull the eye.
  if (!live) {
    return (
      <div className="flex min-w-0 flex-col gap-1 text-[11px]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Lamp state={lamp.state} blink={lamp.blink} label={headline} />
          <span className="engraved-label shrink-0">auto-pilot</span>
          <span className="min-w-0 truncate tabular-nums text-muted-foreground" role="status">{headline}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {ap.status === AUTOPILOT_STATUS.DONE && (
              <PanelButton icon={Eye} onClick={onReviewAll} disabled={busy} title="Review everything the plan committed, as one diff; notes go back to the agent">
                review all
              </PanelButton>
            )}
            <PanelButton onClick={onDismiss} title="Hide this auto-pilot status line (the plan is unchanged)">hide</PanelButton>
          </span>
        </div>
        {ap.status === AUTOPILOT_STATUS.DONE && figures !== 'compact' && (
          <Fig20Timeline
            plan={plan}
            showCount={false}
            fallback={took && <span className="pl-[calc(8px+0.5rem)] tabular-nums text-muted-foreground">took {took}</span>}
          />
        )}
        {ap.status === AUTOPILOT_STATUS.DONE && (
          <span className="pl-[calc(8px+0.5rem)] tabular-nums text-muted-foreground">{tally}</span>
        )}
        {ap.message && <Prose text={ap.message} clamp={3} className="text-[11px] leading-relaxed text-muted-foreground" />}
      </div>
    );
  }
  const runLineEl = (
    <span className="ml-auto shrink-0 font-[family-name:var(--font-legend)] text-[11px] tabular-nums text-muted-foreground">{runLine}</span>
  );
  const stopped = ap.status === AUTOPILOT_STATUS.PAUSED || ap.status === AUTOPILOT_STATUS.FAILED;
  return (
    <div className="ins-well flex min-w-0 flex-col gap-1.5 px-2 py-1.5 text-[11px]">
      <div className="flex min-w-0 items-center gap-2">
        <Lamp state={lamp.state} blink={lamp.blink} label={headline} />
        <span className="engraved-label shrink-0">auto-pilot</span>
        <span className="min-w-0 truncate tabular-nums text-foreground" role="status">{headline}</span>
        {runLineEl}
      </div>
      {/* Full: the loop drawing; compact or too narrow, the headline is enough. */}
      {figures !== 'compact' && <Fig09Loop plan={plan} pos={pos} elapsed={elapsed} fallback={null} />}
      {/* Why it stopped is what you came back for: full ink, more room. */}
      {ap.message && (
        <Prose
          text={ap.message}
          clamp={stopped ? 4 : 3}
          className={stopped ? 'text-[11px] leading-relaxed text-foreground' : 'text-[11px] leading-relaxed text-muted-foreground'}
        />
      )}
      {ap.status === AUTOPILOT_STATUS.PAUSED && AUTO_RESUME_REASONS.has(ap.reason) && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Answer in the terminal and the run carries on by itself, or resume to nudge the agent.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {tabOpen && (
          <PanelButton icon={SquareTerminal} onClick={onGoToTab} title="Switch to the tab running the plan">go to tab</PanelButton>
        )}
        {(ap.status === AUTOPILOT_STATUS.PAUSED || ap.status === AUTOPILOT_STATUS.FAILED) && (
          <PanelButton icon={Play} onClick={onResume} title={tabOpen ? 'Carry on in the same tab' : 'Carry on in this tab'}>
            resume
          </PanelButton>
        )}
        <PanelButton icon={Square} onClick={onStop} title="Turn auto-pilot off (the agent is not interrupted)">stop</PanelButton>
        {options && <span className="ml-auto">{options}</span>}
      </div>
    </div>
  );
}
