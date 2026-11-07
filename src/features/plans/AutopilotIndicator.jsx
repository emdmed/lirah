import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { Lamp } from '../../components/instrument/Lamp';
import { tabDisplayName, useTabManager } from '../tabs/TabContext';
import { useAutopilotRuns, usePlansActions } from './PlansContext';
import { AUTOPILOT_STATUS, haltWord, planProgress, UNTITLED_PLAN } from './planModel';
import { autopilotLamp } from './parts';

/**
 * Status-bar readout of auto-pilot runs, whichever tab is showing: the most
 * urgent run, and a click brings it into view.
 */
export function AutopilotIndicator() {
  const runs = useAutopilotRuns();
  const { revealRun } = usePlansActions();
  const { tabs } = useTabManager();
  if (runs.length === 0) return null;
  const { repoRoot, plan } = runs[0];
  const ap = plan.autopilot;
  const { done, total } = planProgress(plan);
  const label = ap.status === AUTOPILOT_STATUS.RUNNING ? `${done}/${total}` : haltWord(ap);
  const lamp = autopilotLamp(ap);
  // Name the run's tab, so the rail says where to look.
  const tab = tabs.find((t) => t.id === ap.tabId);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => revealRun(repoRoot, plan.id)}
          className="gap-1.5 px-1 h-5 before:content-none after:content-none"
        >
          <Lamp state={lamp.state} blink={lamp.blink} />
          <span className="text-muted-foreground">
            auto-pilot {label}
            {tab && <span className="text-foreground"> · {tabDisplayName(tab)}</span>}
            {runs.length > 1 ? ` +${runs.length - 1}` : ''}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        {plan.title || UNTITLED_PLAN}
        {ap.message ? ` · ${ap.message}` : ''} · click to show
      </TooltipContent>
    </Tooltip>
  );
}
