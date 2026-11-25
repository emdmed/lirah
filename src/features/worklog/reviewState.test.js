import { describe, it, expect } from 'vitest';
import { reviewState } from './reviewState.js';

const flag = (n, over) => ({ n, text: `flag ${n}`, entry: 'e1', at: 100, session: 's1', ...over });
const change = (flags, assumptions = []) => [{ flags, assumptions }];

describe('reviewState', () => {
  it('a later prompt in the same session answers the flags it names', () => {
    const entries = [{ id: 'e2', at: 200, session: 's1', prompt: 'address f2 and F5, also r1' }];
    expect(reviewState(change([flag('F2'), flag('F3'), flag('F5'), flag(null)]), entries)).toEqual({
      'e1:F2': 'answered', 'e1:F3': 'open', 'e1:F5': 'answered', 'e1:F:flag null': 'open',
    });
  });

  it('a prompt from another session, without a session, or earlier does not close it', () => {
    const entries = [
      { id: 'x', at: 200, session: 's2', prompt: 'fix f2' },
      { id: 'y', at: 200, prompt: 'fix f2' },
      { id: 'z', at: 50, session: 's1', prompt: 'fix f2' },
    ];
    expect(reviewState(change([flag('F2')]), entries)['e1:F2']).toBe('open');
    expect(reviewState(change([flag('F2', { session: null })]), entries)['e1:F2']).toBe('open');
  });

  it('dismiss marks it, undo (deleting the key) reopens it', () => {
    const answers = { 'e1:F1': { s: 'dismissed', at: 300 } };
    expect(reviewState(change([flag('F1')]), [], answers)['e1:F1']).toBe('dismissed');
    delete answers['e1:F1'];
    expect(reviewState(change([flag('F1')]), [], answers)['e1:F1']).toBe('open');
  });

  it('assumptions are unchecked until marked right or wrong', () => {
    const as = [0, 1, 2].map((i) => ({ text: `a${i}`, entry: 'e1', at: 100, session: 's1', i }));
    const answers = { 'e1:A0': { s: 'right', at: 1 }, 'e1:A1': { s: 'wrong', at: 1 } };
    expect(reviewState(change([], as), [], answers)).toEqual({ 'e1:A0': 'right', 'e1:A1': 'wrong', 'e1:A2': 'unchecked' });
  });
});
