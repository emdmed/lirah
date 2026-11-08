import { describe, expect, it, vi } from 'vitest';

// The file-groups barrel pulls in UI code that needs a DOM.
vi.mock('../features/file-groups', () => ({ LARGE_FILE_INSTRUCTION: '' }));
const { buildPrompt } = await import('./buildPrompt');

describe('buildPrompt features section', () => {
  it('sends pinned features as FEATURE lines, capped at 3 features and 40 files', () => {
    const many = Array.from({ length: 45 }, (_, i) => `src/f${i}.js`);
    const { sections, text } = buildPrompt({
      textareaContent: '',
      pinnedFeatures: [
        { id: 'a', name: 'Alpha', files: ['src/a.js', 'src/b.js'] },
        { id: 'e', name: 'Empty', files: [] },
        { id: 'z', name: 'Zed', files: many },
        { id: 'x', name: 'Extra', files: ['src/x.js'] },
      ],
    });
    const lines = sections.find((s) => s.id === 'features').body.split('\n');
    expect(lines[0]).toBe('FEATURES (from .orchestration/tools/features.json). Start from these files:');
    expect(lines[1]).toBe('FEATURE Alpha: src/a.js, src/b.js');
    expect(lines[2].split(', ')).toHaveLength(38);
    expect(lines).toHaveLength(3);
    expect(text).toContain('FEATURE Alpha:');
  });

  it('has no features section when nothing is pinned', () => {
    expect(buildPrompt({ textareaContent: 'hi', pinnedFeatures: [] }).sections.map((s) => s.id)).toEqual(['prompt']);
  });
});
