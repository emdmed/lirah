import { describe, it, expect, vi } from 'vitest';
import { killTabCli } from './killTabCli';
import { relaunchCli } from './relaunch';

// kill_pty_child_process contract (Rust, after step 5):
//   resolves false -> that CLI is not running under the shell
//   resolves true  -> it was running and its pid is really gone
//   rejects        -> it is running and could not be stopped (or the session is gone)
const NAMES = ['claude', 'opencode'];

function fakeInvoke(byName) {
  return vi.fn(async (_cmd, { processName }) => {
    const r = byName[processName];
    if (r instanceof Error) throw r;
    return r ?? false;
  });
}

describe('killTabCli', () => {
  it('asks the backend with the session id and each process name, stops at the first kill', async () => {
    const invoke = fakeInvoke({ claude: true });
    await expect(killTabCli({ invoke, sessionId: 's1', names: NAMES })).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('kill_pty_child_process', { sessionId: 's1', processName: 'claude' });
  });

  it('tries the next name when the first is not running', async () => {
    const invoke = fakeInvoke({ opencode: true });
    await expect(killTabCli({ invoke, sessionId: 's1', names: NAMES })).resolves.toBe(true);
    expect(invoke.mock.calls.map((c) => c[1].processName)).toEqual(['claude', 'opencode']);
  });

  it('resolves false when no CLI is running (nothing to kill)', async () => {
    const invoke = fakeInvoke({});
    await expect(killTabCli({ invoke, sessionId: 's1', names: NAMES })).resolves.toBe(false);
  });

  it('a CLI that is running but could not be stopped rejects, and no other name is tried', async () => {
    const invoke = fakeInvoke({ claude: new Error('could not stop claude'), opencode: true });
    await expect(killTabCli({ invoke, sessionId: 's1', names: NAMES })).rejects.toThrow('could not stop claude');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe('relaunch with a CLI that cannot be stopped', () => {
  function run(invoke) {
    const log = [];
    const writePty = vi.fn((d) => { log.push(`pty:${JSON.stringify(d)}`); });
    const launch = vi.fn(async () => { log.push('launch'); });
    const p = relaunchCli({
      kill: () => killTabCli({ invoke, sessionId: 's1', names: NAMES }),
      writeDisplay: vi.fn(),
      writePty,
      launch,
      delayMs: 0,
    });
    return { p, log, writePty, launch };
  }

  it('does not type the launch command (nor Ctrl+C) into a CLI that is still alive', async () => {
    const { p, log, launch } = run(fakeInvoke({ claude: new Error('could not stop claude') }));
    await expect(p).rejects.toThrow('could not stop claude');
    expect(launch).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it('still launches when no CLI was running', async () => {
    const { p, log } = run(fakeInvoke({}));
    await p;
    expect(log).toEqual(['pty:"\\u0003"', 'launch']);
  });

  it('launches after a CLI was stopped', async () => {
    const { p, log } = run(fakeInvoke({ claude: true }));
    await p;
    expect(log).toEqual(['pty:"\\u0003"', 'launch']);
  });
});
