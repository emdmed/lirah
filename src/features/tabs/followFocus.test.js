import { describe, expect, it } from 'vitest';
import { followFocus } from './TabContext';

describe('followFocus', () => {
  it('keeps columns that hold the focused tab', () => {
    expect(followFocus(['a', 'b'], 'a', 'b')).toEqual(['a', 'b']);
  });
  it('puts a new tab in the slot focused before it', () => {
    expect(followFocus(['a', 'b', 'c'], 'b', 'x')).toEqual(['a', 'x', 'c']);
  });
  it('falls back to the last slot', () => {
    expect(followFocus(['a', 'b'], 'gone', 'x')).toEqual(['a', 'x']);
  });
  it('leaves no columns alone', () => {
    expect(followFocus(undefined, 'a', 'x')).toBeUndefined();
  });
});
