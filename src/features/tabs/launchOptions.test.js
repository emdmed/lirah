import { describe, it, expect } from 'vitest';
import { launchOptions, MASTER_PROMPT, VOICE_PROMPTS } from './launchOptions';

// MASTER_PROMPT moves here from ProjectTab.jsx; the three callers (auto-launch,
// relaunch, button) all go through launchOptions.
describe('launchOptions', () => {
  it('exports the master prompt', () => {
    expect(MASTER_PROMPT).toContain('Orchestrating from the workspace terminal');
  });

  it('master tab: system prompt is MASTER_PROMPT', () => {
    expect(launchOptions({ master: true }).systemPrompt).toBe(MASTER_PROMPT);
  });

  it('non-master tab with voice off: no system prompt', () => {
    expect(launchOptions({ master: false, voice: 'off' }).systemPrompt).toBeUndefined();
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

describe('launchOptions voice', () => {
  it('plain voice goes to every tab, after the master prompt', () => {
    expect(launchOptions({ voice: 'plain' }).systemPrompt).toBe(VOICE_PROMPTS.plain);
    expect(launchOptions({ master: true, voice: 'plain' }).systemPrompt).toBe(`${MASTER_PROMPT} ${VOICE_PROMPTS.plain}`);
  });

  it('off adds nothing', () => {
    expect(launchOptions({ voice: 'off' }).systemPrompt).toBeUndefined();
    expect(launchOptions({ master: true, voice: 'off' }).systemPrompt).toBe(MASTER_PROMPT);
  });

  it('voice prompts stay one shell line', () => {
    for (const v of Object.values(VOICE_PROMPTS)) expect(v).not.toMatch(/\n/);
  });
});
