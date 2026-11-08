import { describe, it, expect } from 'vitest';
import { matchFeatures } from './matchFeatures';

const plans = { id: 'plans', name: 'Plans', aliases: ['plan splitter'], files: ['src/plans/split.js', '../outside.js', '/abs.js'] };

describe('matchFeatures', () => {
  it('matches an alias as whole words and drops unsafe paths', () => {
    expect(matchFeatures({ features: [plans] }, 'the plan splitter drops the last chunk'))
      .toEqual([{ id: 'plans', name: 'Plans', word: 'plan splitter', files: ['src/plans/split.js'] }]);
  });

  it('returns nothing when no feature is named', () => {
    expect(matchFeatures({ features: [plans] }, 'tidy the settings dialog')).toEqual([]);
    expect(matchFeatures({ features: [plans] }, 'planssplitter')).toEqual([]);
    expect(matchFeatures(null, 'plans')).toEqual([]);
  });

  it('ignores names shorter than 3 characters', () => {
    expect(matchFeatures({ features: [{ id: 'ui', name: 'UI', files: ['a.js'] }] }, 'fix the ui')).toEqual([]);
  });

  it('caps at 3 features and 40 files', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `feat${i}`, name: `feat${i}`, files: Array.from({ length: 15 }, (_, j) => `f${i}/${j}.js`) }));
    const hits = matchFeatures({ features: many }, 'feat0 feat1 feat2 feat3 feat4');
    expect(hits.map((h) => h.id)).toEqual(['feat0', 'feat1', 'feat2']);
    expect(hits.map((h) => h.files.length)).toEqual([15, 15, 10]);
  });
});
