import { it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested() {} }) }));

const { jobSteps, nextStepIndex } = await import('./AgentJobsContext');

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
