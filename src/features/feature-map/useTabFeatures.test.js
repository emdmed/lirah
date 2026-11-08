import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (_cmd, { path }) => !path.endsWith('gone.js')) }));
const { pinFeature, unpinFeature, selectFeature, clearTabFeatures, getTabFeatures, markFeatureInTree, treeMarks } = await import('./useTabFeatures');

describe('tab features', () => {
  it('pins with existing files only, per tab, and clears', async () => {
    await pinFeature('t1', '/p', { id: 'a', name: 'Alpha', files: ['src/a.js', 'src/gone.js', '../x.js'] });
    selectFeature('t1', 'a');
    expect(getTabFeatures('t1')).toEqual({ selected: 'a', pinned: [{ id: 'a', name: 'Alpha', files: ['src/a.js'] }], marked: null });
    expect(getTabFeatures('t2').pinned).toEqual([]);
    unpinFeature('t1', 'a');
    expect(getTabFeatures('t1').pinned).toEqual([]);
    clearTabFeatures('t1');
    expect(getTabFeatures('t1').selected).toBeNull();
  });

  it('marks the tree until the selection changes', () => {
    selectFeature('t3', 'a');
    markFeatureInTree('t3', ['src/a.js']);
    selectFeature('t3', 'a');
    expect(getTabFeatures('t3').marked).toEqual(['src/a.js']);
    selectFeature('t3', 'b');
    expect(getTabFeatures('t3').marked).toBeNull();
  });

  it('counts feature files per folder', () => {
    const { folders, files } = treeMarks('/p/', ['src/a.js', 'src/ui/b.js', 'top.js']);
    expect([...folders]).toEqual([['/p/src', 2], ['/p/src/ui', 1]]);
    expect([...files]).toEqual(['/p/src/a.js', '/p/src/ui/b.js', '/p/top.js']);
  });
});
