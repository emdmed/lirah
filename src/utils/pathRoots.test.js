import { describe, it, expect } from 'vitest';
import { normalizePath, commonFolder } from './pathUtils';

// A root keeps its slash: 'C:/' is the drive, 'C:' is the cwd of that drive.
describe('roots', () => {
  it.each([
    ['C:\\', 'C:/'],
    ['C:/', 'C:/'],
    ['c:', 'C:'],
    ['/', '/'],
    ['\\\\?\\C:\\', 'C:/'],
  ])('normalizePath(%s) -> %s', (input, out) => {
    expect(normalizePath(input)).toBe(out);
  });
});

describe('commonFolder', () => {
  it.each([
    [['C:/a/b', 'C:/a/c'], 'C:/a'],
    [['C:/a', 'C:/b'], 'C:/'],
    [['C:/a/b', 'D:/a/b'], '/'],
    [['/a/b', '/a/c'], '/a'],
    [['/a', '/b'], '/'],
    [['/a/b'], '/a/b'],
  ])('%j -> %s', (paths, out) => {
    expect(commonFolder(paths)).toBe(out);
  });
});
