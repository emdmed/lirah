import { describe, expect, it } from 'vitest';
import { planFilePath, planRootOf } from './taskModel';

describe('planFilePath', () => {
  it('puts the plan file in <root>/lirah/plans', () => {
    expect(planFilePath('/r/app', { title: 'Add dark mode' })).toBe('/r/app/lirah/plans/add_dark_mode_plan.md');
  });
});

describe('planRootOf', () => {
  it('strips lirah/plans to get the repo', () => {
    expect(planRootOf('/r/app/lirah/plans/x_plan.md')).toBe('/r/app');
    expect(planRootOf('C:\\r\\app\\lirah\\plans\\x_plan.md')).toBe('C:\\r\\app');
  });
  it('keeps the folder of an older root plan file', () => {
    expect(planRootOf('/r/app/x_plan.md')).toBe('/r/app');
    expect(planRootOf('/r/app/docs/x_plan.md')).toBe('/r/app/docs');
  });
});
