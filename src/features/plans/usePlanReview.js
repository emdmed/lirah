import { useCallback, useState } from 'react';
import { chunkReviewRanges, planReviewRanges, reviewOf } from './planGitOps';
import { isMultiRepo } from './planGit';
import { BUSY } from './PlanPaneContext';

// The repo and refs to diff the review's current file against.
function reviewRange(review) {
  const r = review.ranges.find((x) => review.filePath?.startsWith(`${x.path}/`)) || review.ranges[0];
  return { repoPath: r.path, baseRef: r.baseRef, headRef: r.headRef };
}

/**
 * Reviewing a chunk's diff, or the whole plan's, with notes that go back to
 * the agent as a fix prompt. `diffProps` are the GitDiffDialog's props while a
 * review is open, else null.
 */
export function usePlanReview({ repoRoot, plans, withBusy, prepareFor, sendFix, sendPlanFix, activeTabId, toast }) {
  // { planId, chunkId (null: the whole plan), files, filePath, ranges }
  const [review, setReview] = useState(null);
  const [notes, setNotes] = useState([]);
  const [sendingNotes, setSendingNotes] = useState(false);

  const handleReview = useCallback((plan, chunk) => withBusy(BUSY.chunk(chunk.id), async () => {
    const review = await reviewOf(chunkReviewRanges(plan, chunk));
    if (review.files.length === 0) throw new Error('That commit changed no files');
    setNotes([]);
    setReview({ planId: plan.id, chunkId: chunk.id, ...review });
  }), [withBusy]);

  // Everything the plan's chunks committed, as one diff: from before the first
  // chunk started to the last chunk's last commit, limited to their files.
  const handleReviewAll = useCallback((plan) => withBusy(BUSY.REVIEW_ALL, async () => {
    const ranges = planReviewRanges(plan);
    if (ranges.length === 0) throw new Error('No committed chunks to review');
    const review = await reviewOf(ranges);
    if (review.files.length === 0) throw new Error('The plan\'s commits changed no files');
    setNotes([]);
    setReview({ planId: plan.id, chunkId: null, ...review });
  }), [withBusy]);

  const handleSendNotes = useCallback(async () => {
    if (!review || notes.length === 0) return;
    const plan = plans?.find((p) => p.id === review.planId);
    if (plan && !(await prepareFor(plan))) return;
    // Paths within one repo are ambiguous once the plan spans several.
    const sent = plan && isMultiRepo(plan) ? notes.map((n) => ({ ...n, relPath: n.filePath })) : notes;
    setSendingNotes(true);
    try {
      if (review.chunkId) await sendFix(repoRoot, review.planId, review.chunkId, sent, activeTabId);
      else await sendPlanFix(repoRoot, review.planId, sent, activeTabId);
      setReview(null);
      setNotes([]);
      toast.success('Review notes sent to the agent');
    } catch (e) {
      toast.error(`Notes not sent: ${e?.message || e}`);
    } finally {
      setSendingNotes(false);
    }
  }, [review, notes, plans, prepareFor, sendFix, sendPlanFix, repoRoot, activeTabId, toast]);

  const diffProps = review && {
    open: true,
    onOpenChange: (o) => !o && setReview(null),
    filePath: review.filePath,
    ...reviewRange(review),
    changedFiles: review.files,
    onFileChange: (filePath) => setReview((r) => ({ ...r, filePath })),
    annotations: notes,
    onAddAnnotation: (note) => setNotes((list) => [...list, { ...note, id: `${Date.now()}-${list.length}` }]),
    onRemoveAnnotation: (id) => setNotes((list) => list.filter((n) => n.id !== id)),
    onSendAnnotations: handleSendNotes,
    sendingAnnotations: sendingNotes,
  };

  return { handleReview, handleReviewAll, diffProps };
}
