import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (_cmd, { path }) => !path.endsWith('gone.js')) }));
const { pinFeature, unpinFeature, selectFeature, clearTabFeatures, getTabFeatures } = await import('./useTabFeatures');

describe('tab features', () => {
  it('pins with existing files only, per tab, and clears', async () => {
    await pinFeature('t1', '/p', { id: 'a', name: 'Alpha', files: ['src/a.js', 'src/gone.js', '../x.js'] });
    selectFeature('t1', 'a');
    expect(getTabFeatures('t1')).toEqual({ selected: 'a', pinned: [{ id: 'a', name: 'Alpha', files: ['src/a.js'] }] });
    expect(getTabFeatures('t2').pinned).toEqual([]);
    unpinFeature('t1', 'a');
    expect(getTabFeatures('t1').pinned).toEqual([]);
    clearTabFeatures('t1');
    expect(getTabFeatures('t1').selected).toBeNull();
  });
});
