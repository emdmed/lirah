import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogEmpty, DialogTitle } from '@/components/ui/dialog';
import { SegmentBank } from '@/components/instrument/SegmentBank';
import { figNumber } from '@/components/instrument/figure';
import { useTick } from '../../hooks/useTick';
import { basename } from '../../utils/pathUtils';
import { Fig37Lifecycle, LifecycleKey } from './Fig37Lifecycle';
import { CHUNK_STATUS, shortDate } from './planModel';

const SHOW = [
  { value: 'all', label: 'all' },
  { value: 'active', label: 'not shelved' },
];

/** Every plan of the repo on one calendar, from planned to merged (FIG.37). Picking one opens it. */
export function PlanLifecycleDialog({ open, onOpenChange, plans, repoRoot, onOpenPlan }) {
  const [show, setShow] = useState('all');
  // A running plan's lane ends at now.
  const now = useTick(open && plans.some((p) => p.chunks.some((c) => c.status === CHUNK_STATUS.IN_PROGRESS)));
  const shown = show === 'all' ? plans : plans.filter((p) => !p.shelved || p.merged);
  const first = shown.length ? Math.min(...shown.map((p) => p.createdAt)) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        className="flex max-w-[1400px] flex-col gap-3 pt-[22px] pb-5"
        status={first ? `${shown.length} plans · since ${shortDate(first)}` : null}
        fig={figNumber('lifecycle')}
        hints={[{ keys: ['↑', '↓'], label: 'move' }, { keys: ['↵'], label: 'open plan' }]}
      >
        <div className="flex flex-wrap items-center gap-3">
          <DialogTitle>Plan lifecycle · {basename(repoRoot)}</DialogTitle>
          <DialogDescription className="sr-only">Every plan of this repo on one calendar, from planned to merged.</DialogDescription>
          <SegmentBank value={show} options={SHOW} onChange={setShow} label="Plans shown" className="ml-auto" />
        </div>
        {shown.length === 0 ? (
          <DialogEmpty className="justify-center p-8">Every plan here is shelved.</DialogEmpty>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Fig37Lifecycle plans={shown} now={now} onOpen={onOpenPlan} />
            </div>
            <LifecycleKey />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
