import { useEffect, useMemo, useState } from 'react';
import { GitBranch } from 'iconoir-react';
import { Button } from '../../components/ui/button';
import { Lamp } from '../../components/instrument/Lamp';
import { ContextMoon } from '../../components/instrument/ContextMoon';
import { useAgentFileActivity } from '../../components/file-tree/useAgentFileActivity';
import { useBookmarks } from '../bookmarks';
import { tabDisplayName, useTabManager } from '../tabs/TabContext';
import { activityLamp, tabActivity } from '../tabs/tabActivity';
import { getTabContextFill } from '../tabs/tabContextFill';
import { useTabPlans } from '../plans/useTabPlans';
import { isSettledPlan } from '../plans/TabPlanTier';
import { planProgress } from '../plans/planModel';

const noop = () => {};
const GHOST = 'h-5 gap-1.5 px-1.5 text-[11px] font-mono tabular-nums text-muted-foreground';

// Agent edits and reads this turn under `root`, and whether any is still running.
function countFiles(files, root) {
  const c = { edit: 0, read: 0, editLive: false, readLive: false };
  for (const [path, mark] of files) {
    if (!path.startsWith(`${root}/`)) continue;
    c[mark.kind] += 1;
    if (mark.live) c[`${mark.kind}Live`] = true;
  }
  return c;
}

// Zen's strip under the terminal: a name row (which tab, what it is doing,
// its plan, files and context) over a turn row. Fixed 40px so the terminal
// never resizes as it fills. cliName is the agent running in its terminal.
export function ZenStrip({ tabId, isActive, cliName, branchName }) {
  const { workspaceTabs } = useTabManager();
  const { bookmarks } = useBookmarks();
  const index = workspaceTabs.findIndex((t) => t.id === tabId);
  const tab = workspaceTabs[index];
  const ownTab = useMemo(() => (tab ? [tab] : []), [tab]);
  const plans = useTabPlans(ownTab, tabId).byTab[tabId];
  const { files } = useAgentFileActivity(isActive);

  // The tabs pane's 1s clock, for activity and its "since".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isActive]);

  if (!tab) return null;
  const root = tab.projectPath.replace(/\/+$/, '');
  const activity = tabActivity(tabId, cliName, now);
  const plan = plans?.find((p) => !isSettledPlan(p)) ?? plans?.at(-1);
  const progress = plan && planProgress(plan);
  const touched = countFiles(files, root);
  const fill = cliName ? getTabContextFill(tabId) : null;

  return (
    <div className="flex h-10 shrink-0 flex-col px-2 text-[11px] text-muted-foreground">
      <div className="flex h-5 min-w-0 items-center gap-2">
        <span aria-hidden="true" className="w-4 shrink-0 text-center font-mono tabular-nums">{index + 1}</span>
        <span className="ins-name min-w-0 truncate text-[13px] italic leading-5 text-foreground">{tabDisplayName(tab, bookmarks)}</span>
        {branchName && (
          <span className="flex min-w-0 items-center gap-1 font-mono" title={`branch ${branchName}`}>
            <GitBranch className="h-3 w-3 shrink-0" />
            <span className="truncate">{branchName}</span>
          </span>
        )}
        <span className="inline-flex w-[15px] shrink-0 justify-center" title={`${activity.label}${activity.since ? ` · ${activity.since}` : ''}`}>
          <Lamp {...activityLamp(activity.kind, false)} label={activity.label} />
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {progress && (
            <Button variant="ghost" className={GHOST} onClick={noop} title={plan.title || 'plan'}>
              plan {progress.done}/{progress.total}
            </Button>
          )}
          <Button variant="ghost" className={GHOST} onClick={noop} title={`${touched.edit} edited · ${touched.read} read this turn`}>
            files
            {touched.edit > 0 && <><Lamp state="on" blink={touched.editLive} />{touched.edit}</>}
            {touched.read > 0 && (
              <span className={`ins-agent-read inline-flex items-center gap-1 ${touched.readLive ? 'ins-pulse' : ''}`}>
                <Lamp state="off" />{touched.read}
              </span>
            )}
          </Button>
          {fill != null && (
            <Button variant="ghost" className={GHOST} onClick={noop} title={`Context ${Math.round(fill * 100)}% full`}>
              <ContextMoon ratio={fill} />
            </Button>
          )}
        </span>
      </div>
      {/* Turn row: filled in a later step. */}
      <div className="h-5" />
    </div>
  );
}
