import { expect, it } from 'vitest';
import { planDir, planMonth } from './planModel';

it('files a plan under its creation month, zero-padded, in local time', () => {
  expect(planMonth(new Date(2026, 0, 31, 23, 59).getTime())).toBe('2026-01');
  expect(planMonth(new Date(2026, 10, 1, 0, 0).getTime())).toBe('2026-11');
  expect(planDir({ id: 'p1', createdAt: new Date(2025, 11, 9).getTime() })).toBe('plans/2025-12/p1');
});
