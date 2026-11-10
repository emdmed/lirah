import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const { deletedFilesIn } = await import('./useFlatViewNavigation');

// The deleted files git reports directly inside `dirPath`, from the backend's
// raw stats object, in the canonical form.
describe('deletedFilesIn', () => {
  const stats = {
    'C:\\p\\src\\gone.js': { status: 'deleted' },
    'C:\\p\\src\\kept.js': { status: 'modified' },
    'C:\\p\\src\\deep\\also.js': { status: 'deleted' },
    'C:\\p\\other\\x.js': { status: 'deleted' },
  };

  it('lists the deleted files of one folder whatever the key style', () => {
    expect(deletedFilesIn(stats, 'C:/p/src')).toEqual([
      { name: 'gone.js', path: 'C:/p/src/gone.js', is_dir: false, is_deleted: true },
    ]);
  });

  it('takes the folder in any style', () => {
    expect(deletedFilesIn(stats, 'C:\\p\\src\\').map((f) => f.name)).toEqual(['gone.js']);
  });

  it('works with unix paths', () => {
    expect(deletedFilesIn({ '/p/a/gone.js': { status: 'deleted' }, '/p/gone2.js': { status: 'deleted' } }, '/p/a'))
      .toEqual([{ name: 'gone.js', path: '/p/a/gone.js', is_dir: false, is_deleted: true }]);
  });
});
