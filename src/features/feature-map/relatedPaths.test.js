import { describe, expect, it } from 'vitest';
import { relatedPaths } from './useFeatureMap';

describe('relatedPaths', () => {
  it('matches the same path, a folder inside, or a parent', () => {
    expect(relatedPaths('/r/app', '/r/app/')).toBe(true);
    expect(relatedPaths('/r/app/src', '/r/app')).toBe(true);
    expect(relatedPaths('/r/app', '/r/app/src')).toBe(true);
    expect(relatedPaths('C:\\r\\app\\src', 'C:\\r\\app')).toBe(true);
  });
  it('rejects other projects, including name prefixes', () => {
    expect(relatedPaths('/r/other', '/r/app')).toBe(false);
    expect(relatedPaths('/r/app-two', '/r/app')).toBe(false);
  });
});
