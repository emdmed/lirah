import { expect, it } from 'vitest';
import { AUTOPILOT_STATUS, CHUNK_STATUS, canMoveChunk, planDir, planMonth, planTabId } from './planModel';

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

it('moves pending chunks among themselves but never past a committed one', () => {
  const chunks = [
    { status: CHUNK_STATUS.IMPLEMENTED },
    { status: CHUNK_STATUS.IMPLEMENTED, awaitingFix: true },
    { status: CHUNK_STATUS.IN_PROGRESS },
    { status: CHUNK_STATUS.PENDING },
    { status: CHUNK_STATUS.PENDING },
  ];
  expect(canMoveChunk(chunks, 3, 1)).toBe(true);
  expect(canMoveChunk(chunks, 4, -1)).toBe(true);
  expect(canMoveChunk(chunks, 3, -1)).toBe(false);
  expect(canMoveChunk(chunks, 0, 1)).toBe(false);
  expect(canMoveChunk(chunks, 4, 1)).toBe(false);
  expect(canMoveChunk(chunks, -1, 1)).toBe(false);
});
