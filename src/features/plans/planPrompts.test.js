import { describe, expect, it } from 'vitest';
import { buildChunkPrompt, buildFixPrompt, buildNudgePrompt, buildPlanFixPrompt, buildPlanRevisePrompt, buildTaskPlanPrompt, isDraftPath } from './planPrompts';
import { joinDraft } from './usePlanFiles';
import { noGitConfig } from './planModel';

const chunk = { id: 'c1', n: 1, title: 'Do it', body: 'Details.', status: 'pending' };
const gitPlan = { id: 'p1', slug: 'demo', title: 'Demo', chunks: [chunk] };
const noGitPlan = { ...gitPlan, git: noGitConfig('/f') };

describe('no-git prompts', () => {
  it('ask for PLAN-STATUS: done and never mention committing', () => {
    for (const p of [buildChunkPrompt(noGitPlan, chunk, { autopilot: true }), buildFixPrompt(noGitPlan, chunk, []), buildNudgePrompt(noGitPlan, chunk)]) {
      expect(p).toContain('PLAN-STATUS: done');
      expect(p).not.toMatch(/git commit|commit only|isn't committed/);
    }
    expect(buildNudgePrompt(noGitPlan, chunk)).toContain("isn't marked done yet");
  });

  it('leave git plans asking for a commit', () => {
    const p = buildChunkPrompt(gitPlan, chunk);
    expect(p).toContain('git commit -m "plan(demo): 1 — Do it" -m "Plan-Chunk: p1/c1"');
    expect(p).not.toContain("isn't a git repository");
    expect(buildNudgePrompt(gitPlan, chunk)).toContain("isn't committed yet");
  });
});

describe('chunk prompt handoff', () => {
  it('lists each implemented chunk once, with its decisions under it', () => {
    const plan = {
      ...gitPlan,
      chunks: [
        { id: 'a', n: 1, title: 'One', status: 'implemented', decisions: ['Use foo.js'] },
        { id: 'b', n: 2, title: 'Two', status: 'implemented', decisions: [] },
        { id: 'c', n: 3, title: 'Three', status: 'pending' },
      ],
    };
    const p = buildChunkPrompt(plan, plan.chunks[2]);
    expect(p).toContain('Already implemented, with their decisions');
    expect(p).toContain('  1. One\n     - Use foo.js\n  2. Two');
    expect(p.match(/1\. One/g)).toHaveLength(1);
    expect(p).not.toContain('Decisions from earlier chunks');
  });

  it('lists a later implemented chunk without passing on its decisions', () => {
    const plan = {
      ...gitPlan,
      chunks: [
        { id: 'a', n: 1, title: 'One', status: 'pending' },
        { id: 'b', n: 2, title: 'Two', status: 'implemented', decisions: ['Later choice'] },
      ],
    };
    const p = buildChunkPrompt(plan, plan.chunks[0]);
    expect(p).toContain('  2. Two');
    expect(p).not.toContain('Later choice');
  });
});

describe('plan fix prompt', () => {
  it('commits with the plan review trailer', () => {
    const p = buildPlanFixPrompt(gitPlan, [{ relPath: 'a.js', fromLine: 1, note: 'fix' }]);
    expect(p).toContain('git commit -m "plan(demo): review fixes" -m "Plan-Chunk: p1/review"');
  });
});

describe('draft plans', () => {
  it('tells a draft folder from a plan file', () => {
    expect(isDraftPath('/h/.lirah/plans/2026-11/big_plan')).toBe(true);
    expect(isDraftPath('/h/.lirah/plans/2026-11/big_plan/')).toBe(true);
    expect(isDraftPath('/h/.lirah/plans/2026-11/big_plan.md')).toBe(false);
  });

  it('joins a draft plan.md first, then by name, skipping non-.md files', () => {
    const files = [{ name: 'qa.md', text: '## QA\n' }, { name: 'shot.png', text: 'x' }, { name: 'Plan.md', text: '# Big' }, { name: 'arch.md', text: '## Arch' }];
    expect(joinDraft('big_plan', files)).toBe('<!-- file: Plan.md -->\n# Big\n\n<!-- file: arch.md -->\n## Arch\n\n<!-- file: qa.md -->\n## QA');
  });

  it('titles a draft from its folder when the first file has no title', () => {
    expect(joinDraft('dark_mode_plan', [{ name: 'feature.md', text: '## Feature' }])).toBe('# Dark mode\n\n<!-- file: feature.md -->\n## Feature');
    expect(joinDraft('empty_plan', [])).toBe('');
  });

  it('asks for a folder when the task plan path is a draft', () => {
    const task = { title: 'Dark mode', notes: '' };
    expect(buildTaskPlanPrompt({ task, planPath: '/p/dark_mode_plan' })).toContain('draft folder at /p/dark_mode_plan');
    expect(buildTaskPlanPrompt({ task, planPath: '/p/dark_mode_plan.md' })).toContain('Save the finished plan as markdown at /p/dark_mode_plan.md');
  });

  it('revises a draft folder, not one file', () => {
    const plan = { title: 'P', chunks: [] };
    expect(buildPlanRevisePrompt(plan, 'more QA', '/p/x_plan')).toContain('the .md files in the draft folder /p/x_plan');
    expect(buildPlanRevisePrompt(plan, 'more QA', '/p/x_plan.md')).toContain('Edit only /p/x_plan.md.');
  });
});
