import { describe, expect, it } from 'vitest';

import { keyBytes } from './keyNames';

describe('keyBytes', () => {
  it('maps named keys, arrows and ctrl', () => {
    expect(keyBytes('Enter')).toBe('\r');
    expect(keyBytes('esc')).toBe('\x1b');
    expect(keyBytes('down')).toBe('\x1b[B');
    expect(keyBytes('down', { appCursor: true })).toBe('\x1bOB');
    expect(keyBytes('ctrl+c')).toBe('\x03');
    expect(keyBytes('y')).toBe('y');
  });

  it('refuses words that are not keys', () => {
    expect(() => keyBytes('yes')).toThrow(/unknown key "yes"/);
  });
});
