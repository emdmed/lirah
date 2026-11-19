import { it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested() {} }) }));

const { groupRuns, jobSteps, nextStepIndex } = await import('./AgentJobsContext');

const steps = [{ cli: 'claude', prompt: 'a' }, { cli: 'codex', prompt: 'b' }, { cli: 'claude', prompt: 'c' }];

it('moves to the next step only after a successful step of a running job', () => {
  expect(nextStepIndex({ status: 'running', steps, stepIndex: 0 }, true)).toBe(1);
  expect(nextStepIndex({ status: 'running', steps, stepIndex: 1 }, true)).toBe(2);
  expect(nextStepIndex({ status: 'running', steps, stepIndex: 2 }, true)).toBeNull();
  expect(nextStepIndex({ status: 'running', steps, stepIndex: 0 }, false)).toBeNull();
  expect(nextStepIndex({ status: 'cancelled', steps, stepIndex: 0 }, true)).toBeNull();
});

it('reads a job from before steps as one step', () => {
  const old = { status: 'running', cli: 'claude', prompt: 'x' };
  expect(jobSteps(old)).toEqual([{ cli: 'claude', prompt: 'x' }]);
  expect(nextStepIndex(old, true)).toBeNull();
});

it('groups re-runs into one card, ordered by the latest run', () => {
  const a1 = { id: 'a1', label: 'lint', repoPath: '/r', steps, startedAt: 1 };
  const b1 = { id: 'b1', label: 'test', repoPath: '/r', steps, startedAt: 2 };
  const a2 = { id: 'a2', label: 'lint', repoPath: '/r', steps, startedAt: 3 };
  const r1 = { id: 'r1', label: 'old name', recipeId: 'rec', startedAt: 0 };
  const r2 = { id: 'r2', label: 'new name', recipeId: 'rec', startedAt: 4 };
  expect(groupRuns([a1, b1, a2, r1, r2]).map((g) => g.map((j) => j.id))).toEqual([['r2', 'r1'], ['a2', 'a1'], ['b1']]);
});
