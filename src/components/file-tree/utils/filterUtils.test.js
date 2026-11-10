import { describe, it, expect } from 'vitest';
import { filterTreeByGitChanges } from './filterUtils';

// The tree holds canonical paths (see buildTreeFromFlatList); git stats keys
// may still arrive in the backend's own style.
const tree = () => [
  {
    name: 'src', path: 'C:/p/src', is_dir: true,
    children: [{ name: 'a.js', path: 'C:/p/src/a.js', is_dir: false, children: null }],
  },
  { name: 'b.js', path: 'C:/p/b.js', is_dir: false, children: null },
];

describe('filterTreeByGitChanges with Windows paths', () => {
  it('matches changed files whatever the key style', () => {
    const stats = new Map([['C:\\p\\src\\a.js', { status: null }], ['c:/p/b.js', { status: null }]]);
    const out = filterTreeByGitChanges(tree(), stats);
    expect(out.map((n) => n.path)).toEqual(['C:/p/src', 'C:/p/b.js']);
    expect(out[0].children.map((n) => n.path)).toEqual(['C:/p/src/a.js']);
  });

  it('places deleted files under their parent dir and at the root, in canonical form', () => {
    const stats = new Map([
      ['C:\\p\\src\\gone.js', { status: 'deleted' }],
      ['C:\\p\\old.js', { status: 'deleted' }],
    ]);
    const out = filterTreeByGitChanges(tree(), stats);
    const src = out.find((n) => n.path === 'C:/p/src');
    expect(src.children).toEqual([
      { name: 'gone.js', path: 'C:/p/src/gone.js', is_dir: false, is_deleted: true, children: null },
    ]);
    expect(out.at(-1)).toEqual({ name: 'old.js', path: 'C:/p/old.js', is_dir: false, is_deleted: true, children: null });
  });
});
