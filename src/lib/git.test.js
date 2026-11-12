import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => [
    'worktree /repo', 'HEAD abc', 'branch refs/heads/main', '',
    'worktree /repo/.claude/worktrees/feat', 'HEAD def', 'branch refs/heads/feat/x', '',
    'worktree /tmp/detached', 'HEAD 123', 'detached', '',
  ].join('\n')),
}));

const { worktreeList } = await import('./git');

describe('worktreeList', () => {
  it('parses porcelain output, main first, detached as null branch', async () => {
    expect(await worktreeList('/repo')).toEqual([
      { path: '/repo', branch: 'main' },
      { path: '/repo/.claude/worktrees/feat', branch: 'feat/x' },
      { path: '/tmp/detached', branch: null },
    ]);
  });
});
