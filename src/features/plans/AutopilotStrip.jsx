import { formatDuration } from '../../lib/formatDuration';
import { Check, Eye, Play, Square, SquareTerminal } from 'lucide-react';
import { Lamp } from '../../components/instrument/Lamp';
import { PanelButton } from '../../components/instrument/PanelButton';
import { AUTOPILOT_LAMP, Prose } from './parts';
import { useTick } from '../../hooks/useTick';
import { AUTO_RESUME_REASONS, AUTOPILOT_STATUS, CHUNK_STATUS, pilotPosition } from './planModel';

/** Where the auto-pilot run stands, and what you can do about it. */
export function AutopilotStrip({ plan, tabOpen, busy, onResume, onStop, onDismiss, onGoToTab, onReviewAll }) {
  const ap = plan.autopilot;
  const running = ap.status === AUTOPILOT_STATUS.RUNNING;
  const now = useTick(running);
  // Counted like the progress readout: skipped chunks are left out.
  const pos = pilotPosition(plan);
  const chunk = pos?.chunk;
  const at = pos ? `chunk ${pos.index} of ${pos.total}` : null;
  const elapsed = running && chunk?.status === CHUNK_STATUS.IN_PROGRESS && chunk.startedAt ? formatDuration(now - chunk.startedAt) : null;
  const took = ap.startedAt && ap.endedAt ? formatDuration(ap.endedAt - ap.startedAt) : null;
  const headline = {
    [AUTOPILOT_STATUS.RUNNING]: at ? [at, elapsed, ap.nudged && 'nudged to commit'].filter(Boolean).join(' · ') : 'starting',
    [AUTOPILOT_STATUS.PAUSED]: ['needs you', at].filter(Boolean).join(' · '),
    [AUTOPILOT_STATUS.FAILED]: ['error', at].filter(Boolean).join(' · '),
    [AUTOPILOT_STATUS.DONE]: ['plan complete', took && `in ${took}`].filter(Boolean).join(' '),
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
            <PanelButton icon={Check} onClick={onDismiss} title="Clear the status">dismiss</PanelButton>
          </span>
        </div>
        {ap.message && <Prose text={ap.message} clamp={3} className="text-[10px] leading-relaxed text-muted-foreground" />}
      </div>
    );
  }
  return (
    <div className="ins-well flex min-w-0 flex-col gap-1.5 px-2 py-1.5 text-[11px]">
      <div className="flex min-w-0 items-center gap-2">
        <Lamp state={lamp.state} blink={lamp.blink} label={headline} />
        <span className="engraved-label shrink-0">auto-pilot</span>
        <span className="min-w-0 truncate tabular-nums text-foreground" role="status">{headline}</span>
      </div>
      {ap.message && <Prose text={ap.message} clamp={3} className="text-[10px] leading-relaxed text-muted-foreground" />}
      {ap.status === AUTOPILOT_STATUS.PAUSED && AUTO_RESUME_REASONS.has(ap.reason) && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Answer in the terminal and the run carries on by itself, or resume to nudge the agent.
        </p>
      )}
      {running && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Chunks that haven't started can still be edited, skipped or reordered.
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
      </div>
    </div>
  );
}
