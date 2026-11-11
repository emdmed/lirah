import { describe, it, expect } from 'vitest';
import { launchOptions, MASTER_PROMPT } from './launchOptions';

// MASTER_PROMPT moves here from ProjectTab.jsx; the three callers (auto-launch,
// relaunch, button) all go through launchOptions.
describe('launchOptions', () => {
  it('exports the master prompt', () => {
    expect(MASTER_PROMPT).toContain('Orchestrating from the workspace terminal');
  });

  it('master tab: system prompt is MASTER_PROMPT', () => {
    expect(launchOptions({ master: true }).systemPrompt).toBe(MASTER_PROMPT);
  });

  it('non-master tab: no system prompt', () => {
    expect(launchOptions({ master: false }).systemPrompt).toBeUndefined();
    expect(launchOptions({}).systemPrompt).toBeUndefined();
  });

  it('auto-launch passes the resume id through', () => {
    expect(launchOptions({ master: true, resumeId: 'abc-1' })).toEqual({ resumeId: 'abc-1', systemPrompt: MASTER_PROMPT });
    expect(launchOptions({ master: false, resumeId: 'abc-1' })).toEqual({ resumeId: 'abc-1', systemPrompt: undefined });
  });

  it('relaunch and button (no resumeId) resume nothing but keep the master prompt', () => {
    expect(launchOptions({ master: true }).resumeId).toBeUndefined();
    expect(launchOptions({ master: true })).toEqual({ systemPrompt: MASTER_PROMPT });
  });
});
