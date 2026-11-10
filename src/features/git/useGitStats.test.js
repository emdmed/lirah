import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
const { toGitStatsMap } = await import('./useGitStats');

// The map useGitStats keeps must use the same key form as the file tree.
describe('toGitStatsMap', () => {
  it('keys by canonical path whatever the backend sent', () => {
    const s = { added: 1, deleted: 0, status: null };
    const map = toGitStatsMap({ 'C:\\p\\a.js': s, '\\\\?\\C:\\p/src\\b.js': s, 'c:/p/c.js': s, '/home/u/d.js': s });
    expect([...map.keys()]).toEqual(['C:/p/a.js', 'C:/p/src/b.js', 'C:/p/c.js', '/home/u/d.js']);
    expect(map.get('C:/p/a.js')).toBe(s);
  });
});
