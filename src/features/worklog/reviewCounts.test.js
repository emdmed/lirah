import { describe, expect, it } from 'vitest';
import { reviewCounts } from './ReviewBlock';

describe('reviewCounts', () => {
  it('counts open flags only, in words, and leaves out zeros', () => {
    const flags = [{ entry: 'a', n: 'F1', text: 'x' }, { entry: 'a', n: 'F2', text: 'y' }];
    const review = { 'a:F1': 'open', 'a:F2': 'dismissed' };
    expect(reviewCounts({ flags, assumptions: [{}, {}], decided: [] }, review)).toEqual({ text: '1 open flag · 2 assumptions', warn: true });
    expect(reviewCounts({ flags: flags.slice(1), decided: [{}] }, review)).toEqual({ text: '1 decision', warn: false });
  });
});
