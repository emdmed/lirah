import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { Lamp } from '../../components/instrument/Lamp';
import { planProgress, useAutopilotRuns, usePlansActions } from './PlansContext';

const LAMP = {
  running: { state: 'on', blink: true },
  paused: { state: 'warn' },
  failed: { state: 'fault' },
};

/**
 * Status-bar readout of auto-pilot runs, whichever tab is showing: the most
 * urgent run, and a click brings it into view.
 */
export function AutopilotIndicator() {
  const runs = useAutopilotRuns();
  const { revealRun } = usePlansActions();
  if (runs.length === 0) return null;
  const { repoRoot, plan } = runs[0];
  const ap = plan.autopilot;
  const { done, total } = planProgress(plan);
  const label = ap.status === 'running' ? `${done}/${total}` : ap.status === 'paused' ? 'needs you' : 'error';
  const lamp = LAMP[ap.status];
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
            [auto-pilot {label}{runs.length > 1 ? ` +${runs.length - 1}` : ''}]
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        {plan.title || 'Untitled plan'}
        {ap.message ? ` · ${ap.message}` : ''} · click to show
      </TooltipContent>
    </Tooltip>
  );
}
