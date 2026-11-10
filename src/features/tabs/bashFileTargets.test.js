import { describe, it, expect } from 'vitest';
import { bashFileTargets } from './bashFileTargets';

describe('bashFileTargets quoting', () => {
  it('keeps a backslash inside double quotes (not a path separator on unix)', () => {
    // bash prints a\nb literally; it names no file under /p/a.
    expect(bashFileTargets('cat "a\\nb"', '/p')).toEqual([]);
  });

  it('resolves an unquoted Windows path (PowerShell style)', () => {
    expect(bashFileTargets('cat C:\\x\\y', 'C:\\p')).toEqual([{ path: 'C:/x/y', kind: 'read' }]);
  });

  it('resolves a quoted Windows path', () => {
    expect(bashFileTargets("cat 'C:\\x\\y'", 'C:\\p')).toEqual([{ path: 'C:/x/y', kind: 'read' }]);
  });

  it('still resolves unix paths and escaped characters', () => {
    expect(bashFileTargets('cat /p/a.js', '/p')).toEqual([{ path: '/p/a.js', kind: 'read' }]);
    expect(bashFileTargets('cat src/a.js', '/p')).toEqual([{ path: '/p/src/a.js', kind: 'read' }]);
  });
});
