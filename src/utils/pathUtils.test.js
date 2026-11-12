import { describe, it, expect } from 'vitest';
import { normalizePath, toNative } from './pathUtils';

describe('normalizePath', () => {
  it.each([
    ['C:\\a\\b', 'C:/a/b'],
    ['\\\\?\\C:\\a', 'C:/a'],
    ['c:/a', 'C:/a'],
    ['c:\\a/b\\c', 'C:/a/b/c'],
    ['\\\\srv\\share\\x', '//srv/share/x'],
    ['\\\\?\\UNC\\srv\\share\\x', '//srv/share/x'],
    ['C:\\a\\b\\', 'C:/a/b'],
    ['/home/u/p/', '/home/u/p'],
    ['', ''],
    [undefined, undefined],
  ])('%s -> %s', (input, out) => {
    expect(normalizePath(input)).toBe(out);
  });

  it('is idempotent', () => {
    const once = normalizePath('\\\\?\\c:\\a\\b\\');
    expect(normalizePath(once)).toBe(once);
  });
});

describe('toNative', () => {
  it('uses backslashes on Windows', () => {
    expect(toNative('c:/a/b', true)).toBe('C:\\a\\b');
    expect(toNative('//srv/share/x', true)).toBe('\\\\srv\\share\\x');
  });

  it('leaves the path alone elsewhere', () => {
    expect(toNative('/home/u/p', false)).toBe('/home/u/p');
  });
});
