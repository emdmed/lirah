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

  it('lists the open flags under their feature', () => {
    const flags = [{ entry: 'e1', n: 'F2', text: 'hover lags' }, { entry: 'e1', n: 'F3', text: 'done already' }, { entry: 'e2', n: null, text: 'no number' }];
    const features = [{ name: 'Tabs', changes: [{ id: 'a', version: 'v1', flags }] }];
    const review = { 'e1:F2': 'open', 'e1:F3': 'answered', 'e2:F:no number': 'open' };
    expect(changesNotes(features, { a: 'Row menu' }, review)).toBe('## Tabs\n\n- Row menu (v1)\n\nOpen flags:\n- F2: hover lags\n- no number');
  });
});
