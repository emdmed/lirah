import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
let closeHandler;
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a) => invoke(...a) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: (h) => { closeHandler = h; } }),
}));

const { load, save, flush, remove } = await import('./fileStore.js');

// A fake disk: one file per rel, with the same revision rules as store.rs.
let disk;
beforeEach(() => {
  disk = new Map();
  invoke.mockReset().mockImplementation(async (cmd, { rel, data, expectedRevision }) => {
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
});
