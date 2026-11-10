import { describe, it, expect, vi, beforeAll } from 'vitest';

let handler;
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_name, cb) => {
    handler = cb;
    return Promise.resolve(() => {});
  }),
}));
vi.mock('../worklog/worklogStore', () => ({ startEntry: vi.fn(), endEntry: vi.fn() }));

const { startAgentHookListener, getFileActivity } = await import('./agentHookState');

beforeAll(() => startAgentHookListener());

// One tool call as the agent's hook reports it; returns the marks it left.
function marks(tool_name, tool_input, cwd = 'C:\\Users\\u\\p') {
  const sessionId = `s-${Math.random()}`;
  handler({ payload: { sessionId, payload: { hook_event_name: 'PostToolUse', tool_name, tool_input, cwd } } });
  const out = {};
  for (const [path, mark] of getFileActivity().files) out[path] = mark.kind;
  handler({ payload: { sessionId, payload: { hook_event_name: 'SessionEnd' } } });
  return out;
}

describe('file marks from agent tools (canonical paths)', () => {
  it('marks a native Windows path from Read', () => {
    expect(marks('Read', { file_path: 'C:\\Users\\u\\p\\a.js' })).toEqual({ 'C:/Users/u/p/a.js': 'read' });
  });

  it('marks a lowercase-drive forward-slash path from Edit with the canonical key', () => {
    expect(marks('Edit', { file_path: 'c:/Users/u/p/b.js' })).toEqual({ 'C:/Users/u/p/b.js': 'edit' });
  });

  it('marks a mixed-separator path', () => {
    expect(marks('Write', { file_path: 'C:\\Users\\u/p\\c.js' })).toEqual({ 'C:/Users/u/p/c.js': 'edit' });
  });

  it('marks Windows paths named in a Bash command, absolute or relative to a Windows cwd', () => {
    expect(marks('Bash', { command: 'cat C:/Users/u/p/d.js' })).toEqual({ 'C:/Users/u/p/d.js': 'read' });
    expect(marks('Bash', { command: "cat 'C:\\Users\\u\\p\\f.js'" })).toEqual({ 'C:/Users/u/p/f.js': 'read' });
    expect(marks('Bash', { command: 'sed -n 1,5p src/e.js' })).toEqual({ 'C:/Users/u/p/src/e.js': 'read' });
  });

  it('still marks unix paths', () => {
    expect(marks('Read', { file_path: '/home/u/p/a.js' }, '/home/u/p')).toEqual({ '/home/u/p/a.js': 'read' });
  });

  it('ignores a relative path', () => {
    expect(marks('Read', { file_path: 'src\\a.js' })).toEqual({});
  });
});
