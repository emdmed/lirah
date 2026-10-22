import { cn } from '../../lib/utils';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { RowAction } from '../tabs/RowAction';
import { ProgressReadout } from './parts';
import { planStatus } from './PlanRow';
import { AUTOPILOT_STATUS, CHUNK_STATUS, pilotPosition, SPLIT_STATUS, UNTITLED_PLAN } from './planModel';

// What the plan is on right now: why its run stopped, or the chunk in flight.
function nowLine(plan) {
  const ap = plan.autopilot;
  if (plan.split === SPLIT_STATUS.RUNNING) return 'splitting into chunks…';
  if (ap?.message && (ap.status === AUTOPILOT_STATUS.PAUSED || ap.status === AUTOPILOT_STATUS.FAILED)) return ap.message;
  const chunk = pilotPosition(plan)?.chunk
    ?? plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS || c.awaitingFix);
  if (!chunk) return null;
  return `chunk ${chunk.n}${chunk.awaitingFix ? ', fixing' : ''} · ${chunk.title}`;
}

/**
 * A tab row's plan tier: the plan its agent is working through. Live work sits
 * in a well; a finished auto-pilot run drops to one muted line.
 */
export function TabPlanTier({ plan, onOpen }) {
  const { done, total, running, tag, lampState } = planStatus(plan);
  const title = plan.title || UNTITLED_PLAN;
  const ap = plan.autopilot;

  if (ap?.status === AUTOPILOT_STATUS.DONE && !running) {
    return (
      <div className="flex min-w-0 pl-6 text-[11px] text-muted-foreground">
        <RowAction
          onClick={onOpen}
          title="Open the plan"
          className="min-w-0 truncate font-mono tabular-nums hover:text-[var(--ins-lamp)]"
        >
          plan complete: {title} · {done}/{total}
        </RowAction>
      </div>
    );
  }

  const now = nowLine(plan);
  return (
    <RowAction
      onClick={onOpen}
      title={`${title}\nOpen the plan`}
      className="ins-well ml-6 flex min-w-0 flex-col gap-1.5 px-2 py-1.5 text-[11px] outline-none hover:shadow-[inset_0_0_0_1px_var(--ins-edge-strong)] focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
    >
      <span className="flex h-4 min-w-0 items-center gap-2">
        {plan.split === SPLIT_STATUS.RUNNING ? (
          <Scanner />
        ) : (
          <Lamp state={lampState} blink={running} label={tag || (running ? 'in progress' : 'idle')} />
        )}
        <span className="min-w-0 truncate text-foreground">{title}</span>
        {tag && (
          <span
            className={cn(
              'ml-auto shrink-0 text-[10px] tabular-nums',
              ap.status === AUTOPILOT_STATUS.RUNNING ? 'text-[var(--ins-lamp)]' : 'text-[var(--ins-warn)]',
            )}
          >
            {tag}
          </span>
        )}
      </span>
      {plan.split === SPLIT_STATUS.DONE && total > 0 && <ProgressReadout plan={plan} done={done} total={total} />}
      {now && <span className="min-w-0 truncate text-[10px] text-muted-foreground">{now}</span>}
    </RowAction>
  );
}
