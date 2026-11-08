import { describe, expect, it } from 'vitest';
import { AUTOPILOT_STATUS as S, HALT_REASON as R, haltWord } from './planModel';

describe('haltWord', () => {
  it('names what stopped the run', () => {
    expect(haltWord({ status: S.FAILED, reason: R.GIT_ERROR })).toBe('git error');
    expect(haltWord({ status: S.FAILED, reason: R.TAB_CLOSED })).toBe('tab closed');
    expect(haltWord({ status: S.FAILED })).toBe('error');
    expect(haltWord({ status: S.PAUSED, reason: R.BLOCKED })).toBe('waiting');
    expect(haltWord({ status: S.PAUSED, reason: R.PERMISSION })).toBe('needs you');
  });
});
