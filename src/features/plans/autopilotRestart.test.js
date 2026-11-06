import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested: vi.fn() }) }));
const hookStates = new Map();
vi.mock('../tabs/agentHookState', () => ({
  getAgentHookState: (s) => hookStates.get(s) ?? null, getAgentTranscript: () => null, subscribeAgentHooks: () => () => {},
}));
vi.mock('../tabs/terminalActivity', () => ({ getTabSession: (tabId) => `s-${tabId}` }));

const { AUTOPILOT_STATUS, HALT_REASON, normalizeLoadedPlan, stopDrivesRun } = await import('./planModel');
const { assertAgentInTab } = await import('./useAutopilot');

const running = { id: 'p1', split: 'done', chunks: [], autopilot: { status: AUTOPILOT_STATUS.RUNNING, tabId: 't1', chunkId: 'c1' } };

describe('auto-pilot across a restart', () => {
  it('a run read from plan.json is paused, and its agent\'s Stop is then checked like a hand-sent chunk', () => {
    const { autopilot } = normalizeLoadedPlan(running);
    expect(autopilot).toMatchObject({ status: AUTOPILOT_STATUS.PAUSED, reason: HALT_REASON.APP_RESTARTED, tabId: 't1' });
    expect(stopDrivesRun(autopilot)).toBe(false);
    expect(stopDrivesRun(running.autopilot)).toBe(true);
    expect(stopDrivesRun({ status: AUTOPILOT_STATUS.PAUSED, reason: HALT_REASON.NEEDS_INPUT })).toBe(true);
  });

  it('resume refuses a tab with no agent reporting, so nothing is pasted into a bare shell', () => {
    expect(() => assertAgentInTab('t1')).toThrow(/Launch it there/);
    hookStates.set('s-t1', { state: 'waiting', at: 1 });
    expect(() => assertAgentInTab('t1')).not.toThrow();
  });
});
