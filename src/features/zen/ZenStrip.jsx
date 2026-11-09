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
import { chunkRuler } from '../plans/Fig16Chunks';
import { CHUNK_STATUS, planProgress } from '../plans/planModel';
import { getTabSession } from '../tabs/terminalActivity';
import { getLastTurn } from '../tabs/agentHookState';
import { turnSummary } from '../tabs/tabActivity';
import { TurnTrail } from '../tabs/TurnTrail';
import { useAttentionQueue } from '../tabs/useAgentAttention';
import { setSetting, useSetting } from '../settings/settingsStore';
import { cn } from '../../lib/utils';
import { FilesDrawer } from './FilesDrawer';
import { toggleDrawer } from './zenDrawerStore';

const noop = () => {};
const NODE = { done: 'bg-foreground/60', live: 'bg-[var(--ins-lamp)]', fault: 'bg-[var(--ins-fault)]', todo: 'border border-muted-foreground/60' };
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
  const queue = useAttentionQueue(workspaceTabs);
  const folded = useSetting('zenStripFolded');

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
  // Same rules as the tabs pane row: a permission question replaces the turn,
  // and a tab waiting on you (not the one you're on) is framed in lamp gold.
  const queued = !isActive && queue.some((q) => q.tabId === tabId);
  const permission = activity.kind === 'permission';
  const turn = cliName ? getLastTurn(getTabSession(tabId)) : null;
  const summary = turnSummary(turn, now);
  const ruler = plan && chunkRuler(plan);
  const liveChunk = ruler?.live >= 0 ? plan.chunks.filter((c) => c.status !== CHUNK_STATUS.SKIPPED)[ruler.live] : null;

  return (
    <div
      className={cn(
        'flex h-10 shrink-0 flex-col px-2 text-[11px] text-muted-foreground',
        (permission || queued) && 'outline-solid outline-1 -outline-offset-1 outline-[var(--ins-lamp)]',
      )}
    >
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
          <Lamp {...activityLamp(activity.kind, queued)} label={activity.label} />
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {progress && (
            <Button variant="ghost" className={GHOST} onClick={noop} title={plan.title || 'plan'}>
              plan {progress.done}/{progress.total}
            </Button>
          )}
          {/* Only the active tab's strip is the drawer's anchor (every tab renders one). */}
          <Button
            variant="ghost"
            className={GHOST}
            data-zen-segment={isActive ? 'files' : undefined}
            onClick={() => toggleDrawer('files')}
            title={`${touched.edit} edited · ${touched.read} read this turn (Alt+1)`}
          >
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
          <Button
            variant="ghost"
            className={GHOST}
            aria-expanded={!folded}
            onClick={() => setSetting('zenStripFolded', !folded)}
            title={folded ? 'Show the turn row' : 'Fold the turn row'}
          >
            <span className={cn('inline-block transition-transform', folded && '-rotate-90')}>▾</span>
          </Button>
        </span>
      </div>
      {/* Turn row. Folded, it is hidden but keeps its height so the terminal never resizes. */}
      <div className={cn('flex h-5 min-w-0 items-center gap-3', folded && 'invisible')}>
        <span className="flex min-w-0 flex-1 items-center gap-1 [&>div]:pl-0">
          {permission ? (
            <>
              <span className="ins-name min-w-0 truncate text-xs text-[var(--ins-lamp)]">{activity.question ?? activity.label}</span>
              {activity.since && <span className="shrink-0 tabular-nums text-[var(--ins-lamp)]">· {activity.since}</span>}
            </>
          ) : summary ? (
            // Files open in the files drawer, so the trail never unfolds here.
            <TurnTrail turn={turn} summary={summary} root={root} open={false} onToggle={noop} onAttach={noop} />
          ) : (
            <span>no turn yet</span>
          )}
        </span>
        {ruler && ruler.total > 0 && (
          <span className="flex min-w-0 max-w-[50%] items-center gap-2" title={`${ruler.done} of ${ruler.total} chunks implemented`}>
            <span aria-hidden="true" className="flex shrink-0 items-center gap-[3px]">
              {ruler.states.map((st, i) => <span key={i} className={cn('h-1.5 w-1.5', NODE[st])} />)}
            </span>
            {liveChunk && <span className="min-w-0 truncate">chunk {liveChunk.n} · {liveChunk.title}</span>}
          </span>
        )}
      </div>
      {isActive && <FilesDrawer files={files} root={root} />}
    </div>
  );
}
