import { describe, expect, it } from 'vitest';
import { planMergeTarget } from './planModel';

const plan = (over = {}, git = {}) => ({
  chunks: [{ status: 'implemented' }, { status: 'skipped' }],
  git: { worktrees: true, branch: 'plan/x', repos: [{ root: '/r', base: 'main', workPath: '/w/r' }], ...git },
  ...over,
});

describe('planMergeTarget', () => {
  it('points a finished worktree plan at its worktree and base', () => {
    expect(planMergeTarget(plan())).toEqual({ path: '/w/r', base: 'main' });
  });
  it('offers nothing when unfinished, merged, in place or with its worktrees removed', () => {
    expect(planMergeTarget(plan({ chunks: [{ status: 'pending' }] }))).toBeNull();
    expect(planMergeTarget(plan({ merged: { at: 1 } }))).toBeNull();
    expect(planMergeTarget(plan({}, { worktrees: false }))).toBeNull();
    expect(planMergeTarget(plan({}, { removedAt: 1 }))).toBeNull();
  });
});
