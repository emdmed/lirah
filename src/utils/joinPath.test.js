import { describe, it, expect } from 'vitest';
import { joinPath } from './pathUtils';

// handleLoadFileGroup builds `${currentPath}/${relativePath}` today; it will
// call joinPath(base, relative) instead.
describe('joinPath', () => {
  it.each([
    ['C:\\p', 'src\\a.js', 'C:/p/src/a.js'],
    ['c:/p/', 'src/a.js', 'C:/p/src/a.js'],
    ['\\\\?\\C:\\p\\', 'a.js', 'C:/p/a.js'],
    ['C:/p', '.\\src\\a.js', 'C:/p/src/a.js'],
    ['/home/u/p', 'src/a.js', '/home/u/p/src/a.js'],
    ['/home/u/p/', '/src/a.js', '/home/u/p/src/a.js'],
  ])('%s + %s -> %s', (base, rel, out) => {
    expect(joinPath(base, rel)).toBe(out);
  });
});
