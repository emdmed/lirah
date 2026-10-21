import { cn } from '../../lib/utils';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { ProgressReadout } from './parts';
import { AUTOPILOT_STATUS, CHUNK_STATUS, pilotPosition, planProgress, SPLIT_STATUS, UNTITLED_PLAN } from './planModel';

export function PlanRow({ plan, onOpen }) {
  const { done, total } = planProgress(plan);
  const running = plan.chunks.some((c) => c.status === CHUNK_STATUS.IN_PROGRESS || c.awaitingFix);
  const ap = plan.autopilot;
  const tag = AUTOPILOT_TAG[ap?.status];
  const pos = tag ? pilotPosition(plan) : null;
  const lampState = plan.split === SPLIT_STATUS.FAILED || ap?.status === AUTOPILOT_STATUS.FAILED ? 'fault'
    : ap?.status === AUTOPILOT_STATUS.PAUSED ? 'warn'
      : running ? 'on' : total > 0 && done === total ? 'ok' : 'off';
  return (
    <button
      onClick={onOpen}
      className="flex flex-col gap-1.5 px-3 py-2.5 text-left text-[11px] cursor-pointer edge-b-engraved hover:bg-foreground/5 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="flex h-4 shrink-0 items-center">
          {plan.split === SPLIT_STATUS.RUNNING ? (
            <Scanner />
          ) : (
            <Lamp
              state={lampState}
              blink={running}
              label={plan.split === SPLIT_STATUS.FAILED ? 'split failed' : tag || (lampState === 'ok' ? 'complete' : running ? 'in progress' : 'idle')}
            />
          )}
        </span>
        <span className="line-clamp-2 leading-4 text-foreground">{plan.title || UNTITLED_PLAN}</span>
        {plan.split === SPLIT_STATUS.DONE && tag && (
          <span
            className={cn(
              'ml-auto shrink-0 text-[10px] leading-4 tabular-nums',
              ap.status === AUTOPILOT_STATUS.RUNNING ? 'text-[var(--ins-lamp)]' : 'text-[var(--ins-warn)]',
            )}
          >
            {tag}{pos && <span className="text-muted-foreground"> · chunk {pos.index}</span>}
          </span>
        )}
        {plan.split !== SPLIT_STATUS.DONE && (
          <span className="ml-auto shrink-0 text-[10px] leading-4 text-muted-foreground">
            {plan.split === SPLIT_STATUS.RUNNING ? 'splitting' : 'split failed'}
          </span>
        )}
      </div>
      {plan.split === SPLIT_STATUS.DONE && total > 0 && <ProgressReadout plan={plan} done={done} total={total} />}
    </button>
  );
}

const AUTOPILOT_TAG = {
  [AUTOPILOT_STATUS.RUNNING]: 'auto-pilot',
  [AUTOPILOT_STATUS.PAUSED]: 'needs you',
  [AUTOPILOT_STATUS.FAILED]: 'error',
};
