import { describe, it, expect } from 'vitest';
import { changesNotes } from './changesNotes.js';

describe('changesNotes', () => {
  it('writes a heading per feature and a bullet per change', () => {
    const features = [
      { name: 'Tabs', summary: 'Rows gained a menu.', changes: [{ id: 'a', version: 'v0.44.0' }, { id: 'b', noCommit: true, prompts: ['fix the hover'] }] },
      { name: 'Settings', summary: null, changes: [{ id: 'c', version: null, noCommit: false }] },
    ];
    expect(changesNotes(features, { a: 'Row menu', c: 'Model picker' })).toBe(
      '## Tabs\n\nRows gained a menu.\n\n- Row menu (v0.44.0)\n- fix the hover (no commit)\n\n## Settings\n\n- Model picker'
    );
  });
});
