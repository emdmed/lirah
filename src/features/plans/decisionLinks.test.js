import { describe, expect, it } from 'vitest';
import { decisionLinks, hasBuildsOn } from './decisionLinks';

const plan = { chunks: [
  { n: 1, decisions: ['D1: rows not plan', 'unnumbered note'], buildsOn: [] },
  { n: 2, decisions: ['D2: lives in plans/'], buildsOn: ['D1', 'D1', 'D9'] },
  { n: 3, decisions: [], buildsOn: ['D1', 'D2', 'D3'] },
  { n: 4, decisions: ['D3: late'], buildsOn: [] },
] };

describe('decisionLinks', () => {
  it('keeps numbered decisions and links only to later chunks', () => {
    expect(decisionLinks(plan)).toEqual({
      decisions: [
        { id: 'D1', chunk: 1, text: 'rows not plan' },
        { id: 'D2', chunk: 2, text: 'lives in plans/' },
        { id: 'D3', chunk: 4, text: 'late' },
      ],
      links: [{ from: 'D1', to: 2 }, { from: 'D1', to: 3 }, { from: 'D2', to: 3 }],
    });
  });

  it('handles old plans', () => {
    expect(decisionLinks({ chunks: [{ n: 1 }] })).toEqual({ decisions: [], links: [] });
    expect(decisionLinks(null)).toEqual({ decisions: [], links: [] });
    expect(hasBuildsOn({ chunks: [{ n: 1, buildsOn: [] }, { n: 2 }] })).toBe(false);
    expect(hasBuildsOn(plan)).toBe(true);
  });
});
