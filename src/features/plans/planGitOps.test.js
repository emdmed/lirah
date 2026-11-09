import { describe, expect, it, vi } from 'vitest';

// git runs through invoke('run_git_command', { repoPath, args }); answer by command.
const calls = [];
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (_cmd, { args }) => {
    calls.push(args);
    if (args[0] === 'log' && args.includes('--format=%H')) return 'sha2\nsha1\n';
    if (args[0] === 'rev-parse') return 'base0\n';
    if (args[0] === 'log' && args.includes('--format=%ct')) return '1700000000\n';
    return '';
  }),
}));

const { adoptedFacts, chunkCommits } = await import('./planGitOps');

const plan = { id: 'p1', repoRoot: '/r', chunks: [] };

describe('commits made ahead of the run', () => {
  it('searches a never-sent chunk in the whole history, by its trailer', async () => {
    calls.length = 0;
    const found = await chunkCommits(plan, { id: 'c4', status: 'pending' });
    expect(found).toEqual({ '/r': ['sha1', 'sha2'] });
    expect(calls[0]).toEqual(['log', '--format=%H', '--fixed-strings', '--grep=Plan-Chunk: p1/c4']);
  });

  it('leaves a rolled-back chunk with no base or start unsearched: its reverted commits still carry the trailer', async () => {
    calls.length = 0;
    expect(await chunkCommits(plan, { id: 'c4', status: 'rolled-back' })).toEqual({});
    expect(calls).toEqual([]);
  });

  it('gives an adopted chunk a base before its first commit and its last commit\'s time', async () => {
    expect(await adoptedFacts(plan, { '/r': ['sha1', 'sha2'] })).toEqual({ baseShas: { '/r': 'base0' }, doneAt: 1_700_000_000_000 });
  });
});
