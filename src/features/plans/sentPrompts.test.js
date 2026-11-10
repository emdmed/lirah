import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested: vi.fn() }) }));

const { invoke } = await import('@tauri-apps/api/core');
const { sendSaved } = await import('./sentPrompts');

const plan = { id: 'p1', repoRoot: '/r' };
const chunk = { n: 3 };

describe('sendSaved', () => {
  beforeEach(() => invoke.mockReset());

  it('sends, then writes the prompt file and returns its entry', async () => {
    invoke.mockImplementation(async (cmd) => (cmd === 'get_home_dir' ? '/h' : undefined));
    const send = vi.fn();
    const entry = await sendSaved(send, plan, chunk, 'fix', 'hello', 42);
    expect(send).toHaveBeenCalledWith('hello');
    const file = '/r/lirah/plans/p1/prompts/3-fix-42.md';
    expect(invoke).toHaveBeenCalledWith('write_file_content', { path: file, content: 'hello' });
    expect(entry).toEqual({ kind: 'fix', at: 42, file });
  });

  it('still sends when the write fails, and only warns', async () => {
    invoke.mockImplementation(async (cmd) => { if (cmd === 'write_file_content') throw new Error('disk full'); return '/h'; });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const send = vi.fn();
    expect(await sendSaved(send, plan, chunk, 'chunk', 'hi')).toBeNull();
    expect(send).toHaveBeenCalledWith('hi');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('writes nothing when the send fails', async () => {
    await expect(sendSaved(() => Promise.reject(new Error('closed')), plan, chunk, 'nudge', 'x')).rejects.toThrow('closed');
    expect(invoke).not.toHaveBeenCalled();
  });
});
