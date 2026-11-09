import { describe, expect, it } from 'vitest';

import { rowKeys } from './rowKeys';

const letters = (row) => rowKeys(row).flatMap((k) => k.keys);

describe('rowKeys', () => {
  it('offers no link on the active row', () => {
    expect(letters({ active: true, closable: true, edited: true, summary: {} })).not.toContain('l');
    expect(letters({ active: false, closable: true })).toContain('l');
  });

  it('offers no attach or edits without edits', () => {
    const keys = letters({ active: false, closable: true, edited: null, summary: { text: 'done' } });
    expect(keys).not.toContain('a');
    expect(keys).not.toContain('e');
  });

  it('offers resume only while a run on the row is paused or failed', () => {
    const plan = (status) => ({ autopilot: { status } });
    expect(letters({ plans: [plan('paused')] })).toContain('p');
    expect(letters({ plans: [plan('done'), plan('failed')] })).toContain('p');
    expect(letters({ plans: [plan('running')] })).not.toContain('p');
    expect(letters({ plans: [] })).not.toContain('p');
  });
});
