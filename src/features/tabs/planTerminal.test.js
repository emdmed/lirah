import { describe, expect, it } from 'vitest';
import { isProjectTab, planTerminalShown } from './TabContext';

describe('plan terminals', () => {
  const tabs = [
    { id: 'a', showing: 'p1' },
    { id: 'p1', planHost: 'a' },
    { id: 'p2', planHost: 'a' },
    { id: 'm', master: true },
  ];

  it('keeps plan and master terminals out of the tab list', () => {
    expect(tabs.filter(isProjectTab).map((t) => t.id)).toEqual(['a']);
  });

  it('knows which plan terminal its project tab shows', () => {
    expect(planTerminalShown(tabs, 'p1')).toBe(true);
    expect(planTerminalShown(tabs, 'p2')).toBe(false);
    expect(planTerminalShown(tabs, 'gone')).toBe(false);
    expect(planTerminalShown(tabs, null)).toBe(false);
  });
});
