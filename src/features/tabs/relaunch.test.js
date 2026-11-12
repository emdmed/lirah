import { describe, it, expect, vi } from 'vitest';
import { TERMINAL_MODE_RESET } from './terminalReset';
import { relaunchCli } from './relaunch';

// Fakes record every call in one log, so the order between them is asserted.
function setup({ killed = true, killError = null, launchResult = 'launched' } = {}) {
  const log = [];
  const kill = vi.fn(async () => {
    log.push('kill');
    if (killError) throw killError;
    return killed;
  });
  const writeDisplay = vi.fn((d) => { log.push(`display:${d === TERMINAL_MODE_RESET ? 'reset' : d}`); });
  const writePty = vi.fn((d) => { log.push(`pty:${JSON.stringify(d)}`); });
  const launch = vi.fn(async () => { log.push('launch'); return launchResult; });
  return { log, kill, writeDisplay, writePty, launch };
}

describe('relaunchCli', () => {
  it('resets the display, kills (which resets again), sends Ctrl+C to the PTY, then launches', async () => {
    const { log, ...fns } = setup();
    await relaunchCli({ ...fns, delayMs: 0 });
    expect(log).toEqual(['display:reset', 'kill', 'display:reset', 'pty:"\\u0003"', 'launch']);
  });

  it('sends exactly Ctrl+C (\\x03) to the PTY, once', async () => {
    const { writePty, ...rest } = setup();
    await relaunchCli({ ...rest, writePty, delayMs: 0 });
    expect(writePty).toHaveBeenCalledTimes(1);
    expect(writePty).toHaveBeenCalledWith('\x03');
  });

  it('writes the display reset before the kill has resolved', async () => {
    const log = [];
    let release;
    const kill = () => new Promise((resolve) => { release = () => { log.push('kill-resolved'); resolve(true); }; });
    const writeDisplay = vi.fn(() => { log.push('display'); });
    const p = relaunchCli({ kill, writeDisplay, writePty: vi.fn(), launch: vi.fn(), delayMs: 0 });
    await Promise.resolve();
    await Promise.resolve();
    expect(writeDisplay).toHaveBeenCalledWith(TERMINAL_MODE_RESET);
    expect(log).toEqual(['display']);
    release();
    await p;
    expect(log).toEqual(['display', 'kill-resolved', 'display']);
  });

  it('waits delayMs after the kill, then resets again, before Ctrl+C and launch', async () => {
    vi.useFakeTimers();
    try {
      const { log, ...fns } = setup();
      const p = relaunchCli({ ...fns, delayMs: 100 });
      await vi.advanceTimersByTimeAsync(99);
      expect(log).toEqual(['display:reset', 'kill']);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(log).toEqual(['display:reset', 'kill', 'display:reset', 'pty:"\\u0003"', 'launch']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('when nothing was killed: resets once, still sends Ctrl+C, still launches', async () => {
    const { log, ...fns } = setup({ killed: false });
    await relaunchCli({ ...fns, delayMs: 0 });
    expect(log).toEqual(['display:reset', 'kill', 'pty:"\\u0003"', 'launch']);
  });

  it('when kill throws: the error propagates, no Ctrl+C, no launch', async () => {
    const { log, ...fns } = setup({ killError: new Error('boom') });
    await expect(relaunchCli({ ...fns, delayMs: 0 })).rejects.toThrow('boom');
    expect(fns.writePty).not.toHaveBeenCalled();
    expect(fns.launch).not.toHaveBeenCalled();
    expect(log).toEqual(['display:reset', 'kill']);
  });

  it('when the Ctrl+C write rejects: the error propagates and launch does not run', async () => {
    const { log, ...fns } = setup();
    fns.writePty.mockRejectedValueOnce(new Error('pty gone'));
    await expect(relaunchCli({ ...fns, delayMs: 0 })).rejects.toThrow('pty gone');
    expect(fns.launch).not.toHaveBeenCalled();
  });

  it('awaits an async Ctrl+C write before launching', async () => {
    const log = [];
    const writePty = () => new Promise((r) => setTimeout(() => { log.push('pty'); r(); }, 5));
    const launch = vi.fn(async () => { log.push('launch'); });
    await relaunchCli({ kill: async () => true, writeDisplay: vi.fn(), writePty, launch, delayMs: 0 });
    expect(log).toEqual(['pty', 'launch']);
  });

  it('returns what launch returns', async () => {
    const { log, ...fns } = setup({ launchResult: 42 });
    await expect(relaunchCli({ ...fns, delayMs: 0 })).resolves.toBe(42);
  });
});
