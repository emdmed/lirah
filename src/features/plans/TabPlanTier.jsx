import { Archive, Merge, Play, Stop, Terminal } from '@/components/icons';
import { cn } from '../../lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
import { RowAction } from '../tabs/RowAction';
import { Fig16Chunks } from './Fig16Chunks';
import { ProgressReadout } from './parts';
import { planStatus, TAG_TONE } from './PlanRow';
import { AUTOPILOT_STATUS, CHUNK_STATUS, pilotPosition, planMergeTarget, SPLIT_STATUS, UNTITLED_PLAN } from './planModel';

// What the plan is on right now: why its run stopped, or the chunk in flight.
function nowLine(plan) {
  const ap = plan.autopilot;
  if (plan.split === SPLIT_STATUS.RUNNING) return 'splitting into chunks…';
  if (ap?.message && (ap.status === AUTOPILOT_STATUS.PAUSED || ap.status === AUTOPILOT_STATUS.FAILED)) {
    const n = pilotPosition(plan)?.chunk.n;
    return n ? `chunk ${n} · ${ap.message}` : ap.message;
  }
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
 * A tab row's plan tier: the plan its agent is working through, in a well, at
 * one fixed height. With nothing live it shows the latest finished plan and
 * `note` in place of the chunk in flight. A stopped run gets resume (the primary
 * key, also `p` on the row) and stop, in the card's last row. Shelve takes the
 * card off the tab without deleting the plan. Merge (a finished plan in worktrees)
 * opens the merge dialog on its worktree. Terminal flips the tab between its
 * own terminal and the plan's (null: the plan has none yet).
 */
export function TabPlanTier({ plan, note, onOpen, onResume, onStop, onShelve, onMerge, onTerminal, terminalShown }) {
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
      {/* One line, so every card is the same height; the full title is in the tooltip. */}
      <span className="flex min-w-0 items-start gap-2 leading-4">
        <span className="flex h-4 shrink-0 items-center">
          {plan.split === SPLIT_STATUS.RUNNING ? (
            <Scanner />
          ) : (
            <Lamp state={lampState} blink={running} label={tag || (lampState === 'ok' ? 'complete' : running ? 'in progress' : 'idle')} />
          )}
        </span>
        <span className="min-w-0 truncate text-foreground group-hover/well:text-[var(--ins-lamp)]">{title}</span>
        {tag && (
          <span
            className={cn(
              'ml-auto shrink-0 tabular-nums',
              TAG_TONE[lampState] ?? 'text-[var(--ins-lamp)]',
            )}
          >
            {tag}
          </span>
        )}
      </span>
      {/* Every part keeps its room while empty, so the card never changes height. */}
      <Fig16Chunks
        plan={plan}
        blank={plan.split !== SPLIT_STATUS.DONE || total === 0}
        label={`${done} of ${total} chunks implemented`}
        fallback={<ProgressReadout plan={plan} done={done} total={total} paper="var(--ins-well)" />}
      />
      {/* Centred, so a one-line note sits level with the keys instead of above them. */}
      <span className="flex h-8 min-w-0 items-center gap-2 leading-4 text-muted-foreground">
        <span className="line-clamp-2 min-w-0 flex-1 break-words">{note ?? now}</span>
        <span className="flex shrink-0 items-center gap-1">
          {onTerminal && (
            <RowAction
              onClick={onTerminal}
              aria-pressed={terminalShown}
              title={terminalShown ? 'Back to this tab\'s terminal' : 'Show the plan\'s terminal in this tab'}
              className={buttonVariants({ variant: 'ghost', size: 'panel' })}
            >
              <Terminal aria-hidden="true" />{terminalShown ? 'back' : 'terminal'}
            </RowAction>
          )}
          {ap?.status !== AUTOPILOT_STATUS.RUNNING && (<>
            {onMerge && planMergeTarget(plan) && (
              <RowAction onClick={onMerge} title="Merge the plan's branch into its base (the merge dialog shows what it will do)" className={buttonVariants({ variant: 'ghost', size: 'panel' })}>
                <Merge aria-hidden="true" />merge
              </RowAction>
            )}
            <RowAction onClick={onShelve} title="Take this plan off the tab; it stays under all plans" className={buttonVariants({ variant: 'ghost', size: 'panel' })}>
              <Archive aria-hidden="true" />shelve
            </RowAction>
            {(ap?.status === AUTOPILOT_STATUS.PAUSED || ap?.status === AUTOPILOT_STATUS.FAILED) && (<>
            <RowAction onClick={onStop} title="Turn auto-pilot off (the agent is not interrupted)" className={buttonVariants({ variant: 'ghost', size: 'panel' })}>
              <Stop aria-hidden="true" />stop
            </RowAction>
            <RowAction onClick={onResume} title="Carry on in this tab (p)" className={buttonVariants({ variant: 'default', size: 'panel' })}>
              <Play aria-hidden="true" />resume
            </RowAction>
            </>)}
          </>)}
        </span>
      </span>
    </RowAction>
  );
}
