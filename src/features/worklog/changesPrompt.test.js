import { describe, it, expect, vi, beforeEach } from 'vitest';

const disk = new Map();
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a) => invoke(...a) }));
vi.mock('../../lib/fileStore', () => ({
  load: async (rel) => disk.get(rel) ?? null,
  save: async (rel, data) => disk.set(rel, data),
}));

const { buildChangesPrompt, changeKey, digestFile, fallbackTitle, featureKey, parseChangesReply, titleChanges } = await import('./changesPrompt.js');

const change = (id, turns, feature, prompts = [`build ${id}`]) => ({ id, turns, feature, prompts, files: ['a.js'], decisions: [] });
const A = change('a1', 2, 'tabs', ['add a row menu to the tab strip', 'yes']);
const B = { ...change('b1', 1, 'settings'), decisions: ['the model setting defaults to haiku'] };

describe('buildChangesPrompt', () => {
  it('asks for JSON only, with every change id, feature, prompt and decision', () => {
    const p = buildChangesPrompt([A, B]);
    expect(p).toMatch(/JSON only/);
    expect(p).toContain('{"changes":[{"id":"<change id>","title":"<title>"}],"features":[{"name":"<feature>","summary":"<summary>"}]}');
    expect(p).toContain('change a1 | feature: tabs');
    expect(p).toContain('feature named below: tabs, settings');
    expect(p).toContain('  - add a row menu to the tab strip');
    expect(p).toContain(' decisions:\n  - the model setting defaults to haiku');
    expect(p).toMatch(/under 60 characters/);
  });
});

describe('parseChangesReply', () => {
  it('reads titles and summaries, even inside a fence', () => {
    const reply = '```json\n{"changes":[{"id":"a1","title":"Row menu in the tab strip"}],"features":[{"name":"tabs","summary":"Tabs got a row menu."}]}\n```';
    expect(parseChangesReply(reply, [A, B])).toEqual({
      titles: { a1: 'Row menu in the tab strip', b1: 'build b1' },
      summaries: { tabs: 'Tabs got a row menu.' },
    });
  });

  it('falls back to the first prompt, cut to 60 chars, on bad JSON', () => {
    const long = change('c1', 1, null, ['x'.repeat(80)]);
    const { titles, summaries } = parseChangesReply('sorry, I cannot', [A, long]);
    expect(titles.a1).toBe('add a row menu to the tab strip');
    expect(titles.c1).toHaveLength(60);
    expect(titles.c1).toBe(fallbackTitle(long));
    expect(summaries).toEqual({});
  });
});

describe('cache keys', () => {
  it('are stable across order and change with turns', () => {
    expect(changeKey(A)).toBe('a1:2');
    expect(featureKey([A, B])).toBe(featureKey([B, A]));
    expect(featureKey([A])).not.toBe(featureKey([{ ...A, turns: 3 }]));
    expect(digestFile('/home/me/nevo-terminal', '2026-11-16', '2026-11-22')).toMatch(/^worklog\/digests\/nevo-terminal-[0-9a-f]{8}\/2026-11-16_2026-11-22\.json$/);
  });
});

describe('titleChanges', () => {
  beforeEach(() => {
    disk.clear();
    invoke.mockReset();
  });
  const opts = { repo: '/r/app', from: '2026-11-16', to: '2026-11-22', model: 'haiku' };
  const reply = (ids) => JSON.stringify({ changes: ids.map((id) => ({ id, title: `T ${id}` })), features: [{ name: 'tabs', summary: 'S tabs' }, { name: 'settings', summary: 'S settings' }] });

  it('asks once, then only for new or grown changes', async () => {
    invoke.mockResolvedValueOnce(reply(['a1', 'b1']));
    expect(await titleChanges([A, B], opts)).toEqual({ titles: { a1: 'T a1', b1: 'T b1' }, summaries: { tabs: 'S tabs', settings: 'S settings' } });
    expect(invoke).toHaveBeenCalledWith('summarize_worklog', expect.objectContaining({ model: 'haiku', projectDir: '/r/app' }));

    expect((await titleChanges([A, B], opts)).titles.b1).toBe('T b1');
    expect(invoke).toHaveBeenCalledTimes(1);

    const B2 = { ...B, turns: 2 };
    invoke.mockResolvedValueOnce(reply(['b1']));
    await titleChanges([A, B2], opts);
    expect(invoke).toHaveBeenCalledTimes(2);
    const prompt = invoke.mock.calls[1][1].prompt;
    expect(prompt).toContain('change b1');
    expect(prompt).not.toContain('change a1');
  });

  it('falls back without caching when the model call fails', async () => {
    invoke.mockRejectedValueOnce(new Error('no claude'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await titleChanges([A], opts)).titles.a1).toBe('add a row menu to the tab strip');
    expect(disk.size).toBe(0);
  });
});
