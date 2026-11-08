import { describe, it, expect } from 'vitest';
import { applyKeys } from './typedLine';

describe('applyKeys', () => {
  it('types, deletes and resets', () => {
    let l = '';
    for (const k of 'fix the planx') l = applyKeys(l, k);
    l = applyKeys(l, '\x7f');
    expect(l).toBe('fix the plan');
    expect(applyKeys(l, '\x1b[D')).toBe('fix the plan');
    expect(applyKeys(l, '\x1b[200~ splitter\x1b[201~')).toBe('fix the plan splitter');
    expect(applyKeys(l, '\r')).toBe('');
    expect(applyKeys(l, '\x03')).toBe('');
  });
});
