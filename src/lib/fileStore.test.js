import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
let closeHandler;
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a) => invoke(...a) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: (h) => { closeHandler = h; } }),
}));

const { load, save, flush, remove, onExternalChange, reloadChanged, repoFiles } = await import('./fileStore.js');

// A fake disk: one file per rel, with the same revision rules as store.rs.
let disk;
beforeEach(() => {
  disk = new Map();
  invoke.mockReset().mockImplementation(async (cmd, { base, rel: r, data, expectedRevision }) => {
    const rel = base ? `${base}/${r}` : r;
    const cur = disk.get(rel) ?? null;
    if (cmd === 'store_read') return cur;
    if (cmd === 'store_delete') return void disk.delete(rel);
    const rev = cur?.revision ?? 0;
    if (expectedRevision != null && expectedRevision !== rev) throw { kind: 'conflict', current: cur };
    const doc = { ...data, version: 1, revision: rev + 1 };
    disk.set(rel, doc);
    return doc;
  });
});

describe('fileStore', () => {
  it('returns the fallback for a missing file', async () => {
    expect(await load('a.json', { tasks: [] })).toEqual({ tasks: [] });
  });

  it('retries once on conflict by re-applying the updater to the file on disk', async () => {
    await load('t.json');
    disk.set('t.json', { tasks: ['cli'], version: 1, revision: 4 }); // written behind our back
    const add = (cur) => ({ tasks: [...(cur?.tasks ?? []), 'app'] });
    const doc = await save('t.json', add);
    expect(doc).toEqual({ tasks: ['cli', 'app'], version: 1, revision: 5 });
    expect(invoke).toHaveBeenCalledTimes(3); // read, conflicting write, retry
    await save('t.json', { tasks: [] }); // tracked revision is now 5
    expect(disk.get('t.json').revision).toBe(6);
  });

  it('gives up after one retry', async () => {
    invoke.mockRejectedValue({ kind: 'conflict', current: null });
    await expect(save('x.json', { a: 1 })).rejects.toEqual({ kind: 'conflict', current: null });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('coalesces debounced saves and flush writes them now', async () => {
    const p1 = save('s.json', { n: 1 }, { debounce: 10_000 });
    const p2 = save('s.json', { n: 2 }, { debounce: 10_000 });
    expect(invoke).not.toHaveBeenCalled();
    await flush();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(disk.get('s.json').n).toBe(2);
    expect(await p1).toEqual(await p2);
  });

  it('flushes pending saves when the window is closing', async () => {
    save('c.json', { closing: true }, { debounce: 10_000 });
    await closeHandler();
    expect(disk.get('c.json').closing).toBe(true);
  });

  it('remove drops a pending save and deletes the file', async () => {
    await save('r.json', { a: 1 });
    save('r.json', { a: 2 }, { debounce: 10_000 });
    await remove('r.json');
    await flush();
    expect(disk.has('r.json')).toBe(false);
  });

  it('reloads files changed by someone else and skips its own writes', async () => {
    const seen = [];
    const off = onExternalChange((rel) => rel === 'w.json', (doc) => seen.push(doc?.n ?? null));
    await save('w.json', { n: 1 });
    reloadChanged(['w.json', 'other.json']);
    await flush();
    expect(seen).toEqual([]); // our own write: same revision
    disk.set('w.json', { n: 2, version: 1, revision: 7 }); // the CLI wrote it
    reloadChanged(['w.json']);
    await flush();
    expect(seen).toEqual([2]);
    await save('w.json', { n: 3 }); // and our next write expects revision 7
    expect(disk.get('w.json').revision).toBe(8);
    disk.delete('w.json');
    reloadChanged(['w.json']);
    await flush();
    expect(seen).toEqual([2, null]);
    off();
  });

  it('keeps separate revisions for the same rel under two bases', async () => {
    const a = repoFiles('/repo/a');
    const b = repoFiles('/repo/b');
    await a.save('plan.json', { n: 1 });
    await a.save('plan.json', { n: 2 }); // a now expects revision 2
    await b.save('plan.json', { n: 1 }); // b still expects a new file
    await save('plan.json', { n: 1 }); // ~/.lirah is separate too
    expect(disk.get('/repo/a/plan.json').revision).toBe(2);
    expect(disk.get('/repo/b/plan.json').revision).toBe(1);
    expect(disk.get('plan.json').revision).toBe(1);
    expect(invoke).toHaveBeenCalledTimes(4); // no conflicts
    expect(invoke.mock.calls[2][1]).toMatchObject({ base: '/repo/b', rel: 'plan.json' });
    expect(invoke.mock.calls[3][1]).not.toHaveProperty('base');
  });

  it('debounces per base', async () => {
    const a = repoFiles('/repo/a');
    const b = repoFiles('/repo/b');
    a.save('d.json', { n: 'a' }, { debounce: 10_000 });
    b.save('d.json', { n: 'b' }, { debounce: 10_000 });
    await flush();
    expect(disk.get('/repo/a/d.json').n).toBe('a');
    expect(disk.get('/repo/b/d.json').n).toBe('b');
  });

  it('remove under a base leaves other bases alone', async () => {
    const a = repoFiles('/repo/a');
    await a.save('x.json', { n: 1 });
    save('x.json', { n: 2 }, { debounce: 10_000 });
    await a.remove('x.json');
    await flush();
    expect(disk.has('/repo/a/x.json')).toBe(false);
    expect(disk.get('x.json').n).toBe(2);
  });

  it('writeText under a base writes base/rel', async () => {
    expect(await repoFiles('/repo/a').writeText('p.md', '# hi')).toBe('/repo/a/p.md');
    expect(invoke).toHaveBeenCalledWith('write_file_content', { path: '/repo/a/p.md', content: '# hi' });
  });

  it('reloads only watchers of the matching base', async () => {
    const seen = [];
    const off = repoFiles('/repo/a').onExternalChange(() => true, (doc) => seen.push(doc.n));
    disk.set('/repo/a/w.json', { n: 'a', version: 1, revision: 3 });
    disk.set('w.json', { n: 'home', version: 1, revision: 3 });
    reloadChanged(['w.json']); // ~/.lirah change: not ours
    reloadChanged(['w.json'], '/repo/a');
    await flush();
    expect(seen).toEqual(['a']);
    off();
  });
});
