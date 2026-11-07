import { describe, expect, it } from 'vitest';

import { tally } from './tally';

const bucket = (kind) => tally([kind]).map((t) => t.label);

describe('tally', () => {
  it('puts each kind in exactly one bucket', () => {
    expect(bucket('failed')).toEqual(['run stopped']);
    expect(bucket('permission')).toEqual(['needs you']);
    expect(bucket('done')).toEqual(['your turn']);
    for (const k of ['working', 'running', 'remote']) expect(bucket(k)).toEqual(['working']);
    for (const k of ['waiting', 'idle']) expect(bucket(k)).toEqual(['idle']);
  });

  it('counts add up to the number of tabs', () => {
    const kinds = ['failed', 'permission', 'done', 'working', 'remote', 'waiting'];
    const counts = tally(kinds);
    expect(counts.reduce((sum, t) => sum + t.n, 0)).toBe(6);
    expect(counts.find((t) => t.label === 'needs you').n).toBe(1);
  });
});
