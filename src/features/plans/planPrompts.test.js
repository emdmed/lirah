import { describe, expect, it } from 'vitest';
import { buildChunkPrompt, buildFixPrompt, buildNudgePrompt } from './planPrompts';
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
