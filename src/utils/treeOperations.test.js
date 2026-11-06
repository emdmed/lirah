import { describe, it, expect } from 'vitest';
import { nodesFromEntries, setChildrenAt, findNode, incrementallyUpdateTree } from './treeOperations';

const root = nodesFromEntries([
  { name: 'b.txt', path: '/r/b.txt', is_dir: false },
  { name: 'src', path: '/r/src', is_dir: true },
]);

describe('lazy tree', () => {
  it('starts folders unloaded and fills them on expand', () => {
    expect(findNode(root, '/r/src').children).toBe(null);
    const tree = setChildrenAt(root, '/r/src', nodesFromEntries([{ name: 'lib', path: '/r/src/lib', is_dir: true }]));
    expect(findNode(tree, '/r/src/lib').children).toBe(null);
    expect(findNode(root, '/r/src').children).toBe(null); // input untouched
  });

  it('skips created files under unloaded folders and adds new folders unloaded', () => {
    const tree = incrementallyUpdateTree(root, { newUntracked: [
      { path: '/r/src/new.js', is_dir: false },
      { path: '/r/docs', is_dir: true },
    ] }, '/r', { lazy: true });
    expect(findNode(tree, '/r/src').children).toBe(null);
    expect(findNode(tree, '/r/docs').children).toBe(null);
  });

  it('adds created files under loaded folders', () => {
    const loaded = setChildrenAt(root, '/r/src', []);
    const tree = incrementallyUpdateTree(loaded, { newUntracked: [{ path: '/r/src/new.js', is_dir: false }] }, '/r', { lazy: true });
    expect(findNode(tree, '/r/src').children.map(n => n.name)).toEqual(['new.js']);
    expect(findNode(loaded, '/r/src').children).toEqual([]);
  });
});
