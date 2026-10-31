import { cn } from '../../lib/utils';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { RowAction } from '../tabs/RowAction';
import { Fig16Chunks } from './Fig16Chunks';
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

// A finished auto-pilot run: it drops out of the row's live tier.
export function isSettledPlan(plan) {
  return plan.autopilot?.status === AUTOPILOT_STATUS.DONE && !planStatus(plan).running;
}

/**
 * A tab's finished plans folded into one muted line (DESIGN rule 10). One plan
 * keeps its title; several become a count, with the titles in the tooltip.
 */
export function SettledPlans({ plans, onOpen }) {
  if (plans.length === 0) return null;
  const one = plans.length === 1 ? plans[0] : null;
  const { done, total } = one ? planStatus(one) : {};
  return (
    <div className="flex min-w-0 pl-6 text-[11px] text-muted-foreground">
      <RowAction
        tabIndex={-1}
        onClick={() => onOpen(plans[0].id)}
        title={`${plans.map((p) => p.title || UNTITLED_PLAN).join('\n')}\nOpen the plan`}
        className="min-w-0 truncate tabular-nums hover:text-[var(--ins-lamp)]"
      >
        {one ? `plan complete: ${one.title || UNTITLED_PLAN} · ${done}/${total}` : `${plans.length} plans complete`}
      </RowAction>
    </div>
  );
}

/**
 * A tab row's plan tier: the plan its agent is working through, in a well.
 * Finished runs go to SettledPlans instead.
 */
export function TabPlanTier({ plan, onOpen }) {
  const { done, total, running, tag, lampState } = planStatus(plan);
  const title = plan.title || UNTITLED_PLAN;
  const ap = plan.autopilot;

  const now = nowLine(plan);
  return (
    <RowAction
      tabIndex={-1}
      onClick={onOpen}
      title={`${title}\nOpen the plan`}
      className="group/well ins-well ml-6 flex min-w-0 flex-col gap-1.5 px-2 py-1.5 text-[11px] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]"
    >
      <span className="flex h-4 min-w-0 items-center gap-2">
        {plan.split === SPLIT_STATUS.RUNNING ? (
          <Scanner />
        ) : (
          <Lamp state={lampState} blink={running} label={tag || (running ? 'in progress' : 'idle')} />
        )}
        <span className="min-w-0 truncate text-foreground group-hover/well:text-[var(--ins-lamp)]">{title}</span>
        {tag && (
          <span
            className={cn(
              'ml-auto shrink-0 tabular-nums',
              ap.status === AUTOPILOT_STATUS.RUNNING ? 'text-[var(--ins-lamp)]' : 'text-[var(--ins-warn)]',
            )}
          >
            {tag}
          </span>
        )}
      </span>
      {plan.split === SPLIT_STATUS.DONE && total > 0 && (
        <Fig16Chunks
          plan={plan}
          label={`${done} of ${total} chunks implemented`}
          fallback={<ProgressReadout plan={plan} done={done} total={total} />}
        />
      )}
      {now && <span className="min-w-0 truncate text-muted-foreground">{now}</span>}
    </RowAction>
  );
}
