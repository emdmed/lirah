import { describe, expect, it } from 'vitest';
import { placeColumn } from './zenColumns';

describe('placeColumn', () => {
  it('swaps a tab into the focused column', () => {
    expect(placeColumn(['a', 'b'], 'b', 'c', null)).toEqual(['a', 'c']);
    expect(placeColumn([], 'a', 'c', null)).toEqual(['c']);
  });
  it('swaps places with a tab already on screen', () => {
    expect(placeColumn(['a', 'b', 'c'], 'a', 'c', null)).toEqual(['c', 'b', 'a']);
    expect(placeColumn(['a', 'b'], 'a', 'a', 1)).toEqual(['b', 'a']);
  });
  it('adds a column past the end, at most three', () => {
    expect(placeColumn(['a'], 'a', 'b', 2)).toEqual(['a', 'b']);
    expect(placeColumn(['a', 'b'], 'a', 'c', 2)).toEqual(['a', 'b', 'c']);
    expect(placeColumn(['a', 'b'], 'a', 'a', 2)).toEqual(['b', 'a']);
  });
});
