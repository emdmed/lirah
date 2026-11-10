import { describe, it, expect } from 'vitest';
import { buildSummaryPrompt, PERIODS } from './worklogSummary.js';

const entry = (over) => ({ id: 'a', at: new Date(2026, 10, 10, 9, 5).getTime(), prompt: 'fix\n  the login', repo: '/home/u/app', branch: 'main', files: ['src/login.js'], ...over });

describe('worklog summary prompt', () => {
  it('puts one line per prompt: time, repo name, branch, prompt on one line, files', () => {
    const p = buildSummaryPrompt([entry()], 'app, today');
    expect(p).toContain('Scope: app, today\n');
    expect(p).toContain('- 2026-11-10 09:05 | app | main | fix the login | files: src/login.js');
  });

  it('marks running and empty turns, and cuts long file lists and prompts', () => {
    const files = Array.from({ length: 10 }, (_, i) => `f${i}`);
    const p = buildSummaryPrompt([entry({ files: null }), entry({ files: [] }), entry({ files, prompt: 'x'.repeat(500) })], 's');
    expect(p).toContain('files: still running');
    expect(p).toContain('files: none');
    expect(p).toContain('f7 (+2 more)');
    expect(p).toContain(`${'x'.repeat(400)}…`);
  });

  it('keeps the newest 300 prompts and says how many were left out', () => {
    const many = Array.from({ length: 305 }, (_, i) => entry({ id: `${i}`, prompt: `p${i}` }));
    const p = buildSummaryPrompt(many, 's');
    expect(p).toContain('(the 5 oldest prompts are left out)');
    expect(p).not.toContain('| p4 |');
    expect(p).toContain('| p5 |');
  });

  it('starts today at midnight and the week six days before', () => {
    const now = new Date(2026, 10, 10, 15, 0).getTime();
    expect(PERIODS.find((x) => x.id === 'today').since(now)).toBe(new Date(2026, 10, 10).getTime());
    expect(PERIODS.find((x) => x.id === 'week').since(now)).toBe(new Date(2026, 10, 4).getTime());
  });
});
