import { expect, it } from 'vitest';
import { awaitsLifecycle, focusDue } from './planLifecycle';
import { CHUNK_STATUS } from './planModel';

const implemented = { chunks: [{ status: CHUNK_STATUS.IMPLEMENTED }] };

it('polls implemented plans but never shelved ones', () => {
  expect(awaitsLifecycle(implemented)).toBe(true);
  expect(awaitsLifecycle({ ...implemented, shelved: true })).toBe(false);
});

it('lets a focus event check at most once a minute', () => {
  expect(focusDue(-Infinity, 0)).toBe(true);
  expect(focusDue(1000, 59_999)).toBe(false);
  expect(focusDue(1000, 61_000)).toBe(true);
});
