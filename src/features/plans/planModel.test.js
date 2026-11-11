import { expect, it } from 'vitest';
import { AUTOPILOT_STATUS, CHUNK_STATUS, planDir, planMonth, planTabId } from './planModel';

it('files a plan under its creation month, zero-padded, in local time', () => {
  expect(planMonth(new Date(2026, 0, 31, 23, 59).getTime())).toBe('2026-01');
  expect(planMonth(new Date(2026, 10, 1, 0, 0).getTime())).toBe('2026-11');
  expect(planDir({ id: 'p1', createdAt: new Date(2025, 11, 9).getTime() })).toBe('plans/2025-12/p1');
});

const busy = {
  autopilot: { status: AUTOPILOT_STATUS.RUNNING, tabId: 'ap' },
  chunks: [{ tabId: 'ch', status: CHUNK_STATUS.IN_PROGRESS }],
};

it('prefers the plan tab over auto-pilot and chunk tabs', () => {
  expect(planTabId({ ...busy, tabId: 'own' })).toBe('own');
});

it('falls back to auto-pilot, then chunk tabs, when the plan has no tab', () => {
  expect(planTabId({ ...busy, tabId: null })).toBe('ap');
  expect(planTabId({ ...busy, tabId: null, autopilot: null })).toBe('ch');
});
