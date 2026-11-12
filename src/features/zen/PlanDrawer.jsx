import { Suspense, useState } from 'react';
import { lazyNamed } from '../../lib/lazyNamed';
import { shortcutKeys } from '../../lib/shortcuts';
import { ChunkRow } from '../plans/ChunkRow';
import { onListKey } from '../plans/PlanDetail';
import { PlanPaneProvider } from '../plans/PlanPaneContext';
import { usePlans } from '../plans/PlansContext';
import { nextChunkId, UNTITLED_PLAN } from '../plans/planModel';
import { usePlanPaneActions } from '../plans/usePlanPaneActions';
import { ZenDrawer } from './ZenDrawer';

const GitDiffDialog = lazyNamed(() => import('../git/GitDiffDialog'), 'GitDiffDialog');
const noop = () => {};

// The strip's plan as the plans pane's chunk rows, with their keys (j/k, i
// implement, s skip, r review…). Focus lands on the next chunk.
export function PlanDrawer({ plan, repoRoot }) {
  const next = nextChunkId(plan);
  return (
    <ZenDrawer
      id="plan"
      title={plan.title || UNTITLED_PLAN}
      keys={shortcutKeys('zen-plan')}
      focus={next ? `#chunk-${next} [data-plan-row]` : undefined}
      className="w-[32rem]"
    >
      <PlanChunks plan={plan} repoRoot={repoRoot} />
    </ZenDrawer>
  );
}

// Mounted only while the drawer is open, so its handlers don't run beside the pane's.
function PlanChunks({ plan, repoRoot }) {
  const { plans } = usePlans(repoRoot);
  const { busy, starting, paneActions, diffProps } = usePlanPaneActions({ repoRoot, plans, openPlan: plan, setOpenPlanId: noop });
  const [open, setOpen] = useState(null);
  return (
    <PlanPaneProvider busy={busy} starting={starting} actions={paneActions}>
      <div className="flex flex-col py-1" onKeyDown={onListKey}>
        {plan.chunks.map((chunk) => (
          <ChunkRow
            key={chunk.id}
            plan={plan}
            chunk={chunk}
            open={open === chunk.id}
            onToggle={() => setOpen((id) => (id === chunk.id ? null : chunk.id))}
          />
        ))}
      </div>
      <Suspense fallback={null}>{diffProps && <GitDiffDialog {...diffProps} />}</Suspense>
    </PlanPaneProvider>
  );
}
