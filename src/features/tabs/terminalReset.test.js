import { describe, it, expect, vi } from 'vitest';
import { TERMINAL_MODE_RESET, killCliAndResetTerminal } from './terminalReset';

describe('TERMINAL_MODE_RESET', () => {
  it.each([1000, 1002, 1003, 1005, 1006, 1015, 2004, 1004, 1047])('turns off private mode %i (DECRST)', (m) => {
    // the mode may sit alone or inside a combined list: ESC [ ? 1000 ; 1002 l
    const resets = [...TERMINAL_MODE_RESET.matchAll(/\x1b\[\?([\d;]+)l/g)].flatMap((x) => x[1].split(';').map(Number));
    expect(resets).toContain(m);
  });

  it('never sends 1049: its reset restores a saved cursor even in the normal screen', () => {
    expect(TERMINAL_MODE_RESET).not.toMatch(/\x1b\[\?(?:[\d;]*;)?1049(?:;[\d;]*)?[hl]/);
  });

  it('shows the cursor', () => {
    expect(TERMINAL_MODE_RESET).toContain('\x1b[?25h');
  });

  it('pops the kitty keyboard mode (CSI < u)', () => {
    expect(TERMINAL_MODE_RESET).toContain('\x1b[<u');
  });

  it('contains no set (h) of a mouse or paste mode', () => {
    for (const m of [1000, 1002, 1003, 1005, 1006, 1015, 2004, 1004, 1047]) {
      expect(TERMINAL_MODE_RESET).not.toMatch(new RegExp(`\\x1b\\[\\?(?:[\\d;]*;)?${m}(?:;[\\d;]*)?h`));
    }
  });
});

describe('killCliAndResetTerminal', () => {
  it('kills, then writes the reset to the display, then returns', async () => {
    const order = [];
    const kill = vi.fn(async () => { order.push('kill'); return true; });
    const write = vi.fn((d) => { order.push('write'); });
    const killed = await killCliAndResetTerminal({ kill, write, delayMs: 0 });
    order.push('returned');
    expect(killed).toBe(true);
    expect(order).toEqual(['kill', 'write', 'returned']);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(TERMINAL_MODE_RESET);
  });

  it('waits for an async write before returning', async () => {
    let written = false;
    const write = () => new Promise((r) => setTimeout(() => { written = true; r(); }, 5));
    await killCliAndResetTerminal({ kill: async () => true, write, delayMs: 0 });
    expect(written).toBe(true);
  });

  it('does not write when nothing was killed', async () => {
    const write = vi.fn();
    const killed = await killCliAndResetTerminal({ kill: async () => false, write, delayMs: 0 });
    expect(killed).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('propagates a kill error and does not write', async () => {
    const write = vi.fn();
    await expect(killCliAndResetTerminal({ kill: async () => { throw new Error('boom'); }, write, delayMs: 0 })).rejects.toThrow('boom');
    expect(write).not.toHaveBeenCalled();
  });

  it('waits delayMs after the kill before writing the reset', async () => {
    vi.useFakeTimers();
    try {
      const write = vi.fn();
      const p = killCliAndResetTerminal({ kill: async () => true, write, delayMs: 100 });
      await vi.advanceTimersByTimeAsync(99);
      expect(write).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(write).toHaveBeenCalledWith(TERMINAL_MODE_RESET);
    } finally {
      vi.useRealTimers();
    }
  });
});
