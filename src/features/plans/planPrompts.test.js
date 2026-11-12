import { describe, expect, it } from 'vitest';
import { buildChunkPrompt, buildFixPrompt, buildNudgePrompt, buildPlanFixPrompt } from './planPrompts';
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
