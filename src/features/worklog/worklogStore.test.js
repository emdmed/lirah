import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, renameSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Real git for run_git_command, an in-memory ~/.lirah for the store.
let disk;
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd, a) => {
    if (cmd === 'run_git_command') {
      try {
        return execFileSync('git', a.args, { cwd: a.repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        if (e.stderr) throw e.stderr;
        return e.stdout ?? '';
      }
    }
    if (cmd === 'store_append') return void disk.set(a.rel, (disk.get(a.rel) ?? '') + `${a.line}\n`);
    if (cmd === 'store_read_text') return disk.get(a.rel) ?? null;
    if (cmd === 'store_list') return [...disk.keys()].filter((k) => k.startsWith(`${a.rel}/`)).map((k) => k.slice(a.rel.length + 1)).sort();
    if (cmd === 'start_lirah_watcher') return;
    throw new Error(`unexpected ${cmd}`);
  },
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested: () => {} }) }));

const { startEntry, endEntry, parseStatus, parseLog, readLog, monthFile } = await import('./worklogStore.js');

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
let repo;
let n = 0;
beforeEach(() => {
  disk = new Map();
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'worklog-')));
  sh(repo, 'init', '-q', '-b', 'main');
  sh(repo, 'config', 'user.email', 't@t');
  sh(repo, 'config', 'user.name', 't');
  for (const f of ['keep.txt', 'del.txt', 'old.txt', 'dirty.txt']) writeFileSync(join(repo, f), f);
  sh(repo, 'add', '.');
  sh(repo, 'commit', '-qm', 'init');
  writeFileSync(join(repo, 'dirty.txt'), 'already dirty before the prompt');
});
const entries = () => [...disk.keys()].sort().flatMap((k) => parseLog(disk.get(k)));
const turn = async (prompt, work, edited) => {
  const session = `s${n++}`;
  await startEntry(session, { prompt, cwd: join(repo) });
  work();
  await endEntry(session, edited);
  return entries().at(-1);
};

describe('worklog', () => {
  it('logs prompt and branch, and counts Bash-style edits, deletes, renames and commits', async () => {
    const e = await turn('fix the thing', () => {
      writeFileSync(join(repo, 'keep.txt'), 'sed -i');
      rmSync(join(repo, 'del.txt'));
      renameSync(join(repo, 'old.txt'), join(repo, 'new.txt'));
      mkdirSync(join(repo, 'gen'));
      writeFileSync(join(repo, 'gen/out.js'), 'codegen');
      writeFileSync(join(repo, 'committed.txt'), 'x');
      sh(repo, 'add', 'committed.txt');
      sh(repo, 'commit', '-qm', 'mid-turn');
    }, new Set(['/elsewhere/notes.md', join(repo, 'keep.txt')]));
    expect(e).toMatchObject({ prompt: 'fix the thing', branch: 'main', repo });
    // dirty.txt was dirty before and untouched, so it isn't counted.
    expect(e.files).toEqual(['/elsewhere/notes.md', 'committed.txt', 'del.txt', 'gen/out.js', 'keep.txt', 'new.txt', 'old.txt']);
  });

  it('counts a change to a file that was already dirty', async () => {
    const e = await turn('again', () => writeFileSync(join(repo, 'dirty.txt'), 'changed more'));
    expect(e.files).toEqual(['dirty.txt']);
  });

  it('skips empty prompts', async () => {
    expect(startEntry('x', { prompt: '  ', cwd: repo })).toBeNull();
    expect(entries()).toEqual([]);
  });

  it('keeps prompts from every repo in one log', async () => {
    const other = realpathSync(mkdtempSync(join(tmpdir(), 'worklog-other-')));
    sh(other, 'init', '-q', '-b', 'dev');
    await turn('in repo', () => {});
    await startEntry('o', { prompt: 'in other', cwd: other });
    await endEntry('o');
    expect(entries().map((e) => [e.prompt, e.repo, e.branch])).toEqual([['in repo', repo, 'main'], ['in other', other, 'dev']]);
  });

  it('appends a start and an end line to the month file', async () => {
    await turn('one', () => {});
    const lines = disk.get(monthFile(Date.now())).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(['start', 'end']);
  });

  it('reads past a torn line and ignores an end without its start', () => {
    const text = [
      JSON.stringify({ type: 'start', id: 'a', at: 1, prompt: 'p', repo: '/r', branch: 'main' }),
      JSON.stringify({ type: 'end', id: 'zz', at: 2, files: ['x'] }),
      JSON.stringify({ type: 'end', id: 'a', at: 3, files: ['f'] }),
      '{"type":"start","id":"b","pro',
    ].join('\n');
    expect(parseLog(text)).toEqual([{ id: 'a', at: 1, prompt: 'p', repo: '/r', branch: 'main', endedAt: 3, files: ['f'] }]);
  });

  it('reads the newest months and says when older ones exist', async () => {
    for (const m of ['2026-09', '2026-10', '2026-11']) {
      disk.set(`worklog/${m}.jsonl`, `${JSON.stringify({ type: 'start', id: m, at: 1, prompt: m })}\n`);
    }
    expect(await readLog(2)).toMatchObject({ entries: [{ id: '2026-10' }, { id: '2026-11' }], older: true });
    expect((await readLog(3)).older).toBe(false);
  });

  it('parses porcelain -z status', () => {
    expect(parseStatus(' M a\0 D b\0D  c\0?? d e\0')).toEqual([
      { path: 'a', gone: false },
      { path: 'b', gone: true },
      { path: 'c', gone: true },
      { path: 'd e', gone: false },
    ]);
  });
});
