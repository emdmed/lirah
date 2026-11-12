import { memo, Suspense, useCallback, useEffect, useState } from 'react';
import { lazyNamed } from '../../lib/lazyNamed';
import { Scanner } from '../../components/instrument/Scanner';
import { useToast } from '../toast';
import { useTabManager } from '../tabs/TabContext';
import { usePlans } from './PlansContext';
import { usePlanFiles } from './usePlanFiles';
import { FoundPlansSection } from './FoundPlansSection';
import { EmptyLine, NewRow } from './parts';
import { PLAN_STAGE, planStage, runRank, UNTITLED_PLAN } from './planModel';
import { basename } from '../../utils/pathUtils';
import { useRepoRoot } from './planRepoRoot';
import { subscribePlanFocus, takePlanFocus } from './plansPaneEvents';
import { PlanDetail } from './PlanDetail';
import { PlanPaneProvider } from './PlanPaneContext';
import { usePlanPaneActions } from './usePlanPaneActions';
import { PlanRow } from './PlanRow';
import { getTabPrompt } from '../tabs/tabPrompts';
import { setPlanningMode } from '../planning/planningModeStore';
import { getTabSession } from '../tabs/terminalActivity';
import { useCliRunning } from '../tabs/useTabsSummary';

const GitDiffDialog = lazyNamed(() => import('../git/GitDiffDialog'), 'GitDiffDialog');
const NewPlanDialog = lazyNamed(() => import('./NewPlanDialog'), 'NewPlanDialog');
const PlanLifecycleDialog = lazyNamed(() => import('./PlanLifecycleDialog'), 'PlanLifecycleDialog');

/** The plans of the active tab's repo: a list, or one plan's chunks. */
export const PlansPane = memo(function PlansPane({ projectPath }) {
  const { repoRoot } = useRepoRoot(projectPath);
  const { plans, createPlan, replaceSource } = usePlans(repoRoot);
  const { files, importFile, deleteFile } = usePlanFiles({ repoRoot, plans, createPlan, replaceSource });
  const { activeTabId } = useTabManager();
  const toast = useToast();

  const [openPlanId, setOpenPlanId] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [showTucked, setShowTucked] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const openPlan = plans?.find((p) => p.id === openPlanId) || null;
  useEffect(() => setOpenPlanId(null), [repoRoot]);

  // A plan asked for by a notification or the status bar, once its repo's
  // plans are here (after the reset above, so it wins on a tab switch).
  const [focusSeq, setFocusSeq] = useState(0);
  useEffect(() => subscribePlanFocus(() => setFocusSeq((n) => n + 1)), []);
  useEffect(() => {
    const id = takePlanFocus(plans);
    if (id) setOpenPlanId(id);
  }, [plans, focusSeq]);

  const { busy, starting, paneActions, diffProps } = usePlanPaneActions({ repoRoot, plans, openPlan, setOpenPlanId });

  const handleCreate = useCallback(async ({ source, importedFrom }) => {
    try {
      const id = await createPlan(repoRoot, { source, importedFrom });
      setOpenPlanId(id);
    } catch (e) {
      toast.error(`Couldn't create the plan: ${e?.message || e}`);
    }
  }, [createPlan, repoRoot, toast]);

  // Only into a running agent: in a bare shell the pasted lines would run as commands.
  const activeSession = getTabSession(activeTabId);
  const agentRunning = useCliRunning(activeSession, newOpen);
  const sendBlocked = !activeSession ? 'this tab has no terminal yet'
    : !agentRunning ? 'no agent is running in this tab' : null;
  const handleSendPrompt = useCallback(async (text) => {
    const send = getTabPrompt(activeTabId)?.send;
    if (!send) throw new Error('This tab has no terminal yet');
    await send(text);
  }, [activeTabId]);

  if (!projectPath) return <EmptyLine hint="open a project tab to keep its plans">no project</EmptyLine>;
  if (!plans) {
    return <div className="flex justify-center py-4"><Scanner size="md" label="Loading plans" /></div>;
  }

  const sorted = [...plans].sort((a, b) => runRank(a) - runRank(b));
  const tucked = sorted.filter(isTucked).length;
  const shown = showTucked ? sorted : sorted.filter((p) => !isTucked(p));

  return (
    <>
      {openPlan ? (
        <PlanPaneProvider busy={busy} starting={starting} actions={paneActions}>
          <PlanDetail plan={openPlan} />
        </PlanPaneProvider>
      ) : (
        <>
          <FoundPlansSection files={files} importFile={importFile} deleteFile={deleteFile} />
          {plans.length === 0 ? (
            <EmptyLine hint="N pastes a plan; an agent splits it into chunks you implement one commit at a time">
              no plans
            </EmptyLine>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-1 text-[11px] text-muted-foreground edge-b-engraved">
                <span className="engraved-label">plans</span>
                <span className="font-mono tabular-nums">{plans.length}</span>
                <span className="truncate">· {basename(repoRoot)}</span>
                <button
                  type="button"
                  onClick={() => setShowTimeline(true)}
                  className="tui-btn ml-auto shrink-0"
                  title="Every plan from planned to merged, on one calendar"
                >
                  timeline
                </button>
                {tucked > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowTucked((v) => !v)}
                    aria-pressed={showTucked}
                    className="tui-btn shrink-0"
                    title={showTucked ? 'Hide finished and shelved plans' : 'Show finished and shelved plans'}
                  >
                    {showTucked ? 'hide' : 'show'} {tucked} done/shelved
                  </button>
                )}
              </div>
              {shown.map((plan) => (
                <PlanRow key={plan.id} plan={plan} onOpen={() => setOpenPlanId(plan.id)} />
              ))}
            </div>
          )}
          <NewRow label="plan" keys="N" onClick={() => setNewOpen(true)} />
          <button type="button" onClick={() => setPlanningMode(activeTabId, true)} className="tui-btn mx-3 mb-2 self-start" title="Draft and chunk a plan next to this tab's terminal (Alt P)">
            planning mode
          </button>
        </>
      )}

      <Suspense fallback={null}>
        {/* All plans, done and shelved too: the timeline is their history. */}
        {showTimeline && (
          <PlanLifecycleDialog
            open
            onOpenChange={setShowTimeline}
            plans={plans}
            repoRoot={repoRoot}
            onOpenPlan={(id) => { setShowTimeline(false); setOpenPlanId(id); }}
          />
        )}
        {newOpen && <NewPlanDialog open onOpenChange={setNewOpen} onCreate={handleCreate} onSendPrompt={handleSendPrompt} sendBlocked={sendBlocked} />}
        {diffProps && (
          <GitDiffDialog {...diffProps} />
        )}
      </Suspense>
    </>
  );
});

// Done or shelved plans stay out of the list until asked for. An open PR still needs you.
export function isTucked(plan) {
  if (plan.shelved || plan.cancelledAt) return true;
  const stage = planStage(plan);
  return stage === PLAN_STAGE.MERGED || stage === PLAN_STAGE.IMPLEMENTED;
}
