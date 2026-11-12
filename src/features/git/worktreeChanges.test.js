import { describe, expect, it, vi } from 'vitest';

const out = {
  'merge-base': 'abc123\n',
  diff: 'M\tsrc/b.js\nR100\told.js\tsrc/a.js\nD\tREADME.md\n',
  'ls-files': 'new.txt\n',
};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (_cmd, { args }) => out[args.find((a) => out[a])]),
}));

const { worktreeChanges } = await import('./worktreeChanges');

describe('worktreeChanges', () => {
  it('lists tracked and untracked changes, root first, then folder by folder', async () => {
    expect(await worktreeChanges('/wt', 'main')).toEqual({
      baseRef: 'abc123',
      files: [
        { path: '/wt/new.txt', status: 'A' },
        { path: '/wt/README.md', status: 'D' },
        { path: '/wt/src/a.js', status: 'R' },
        { path: '/wt/src/b.js', status: 'M' },
      ],
    });
  });
});
