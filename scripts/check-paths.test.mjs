import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanJs, scanRust, scanRepo } from './check-paths.mjs';

const names = (r) => r.map((x) => x.name);

describe('scanJs', () => {
  it('flags each pattern', () => {
    const src = [
      "a.split('/')",
      'b.lastIndexOf("/")',
      "c.startsWith('/')",
      "d.replace(/\\\\/g, '/')",
    ].join('\n');
    expect(scanJs(src).map((x) => x.line)).toEqual([1, 2, 3, 4]);
  });

  it('ignores other separators, comment lines and opted-out lines', () => {
    const src = [
      "a.split('.')",
      "// b.split('/')",
      " * c.startsWith('/')",
      "d.split('/') // paths-ok: URL path",
      "e.startsWith('/') // paths-ok:",
    ].join('\n');
    expect(names(scanJs(src))).toEqual(["startsWith('/')"]);
  });
});

describe('scanRust', () => {
  it('flags canonicalize but not comments, strings or opted-out lines', () => {
    const src = [
      'let a = p.canonicalize();',
      'let b = std::fs::canonicalize(p);',
      '// p.canonicalize()',
      'let s = "canonicalize(";',
      'let c = p.canonicalize(); // paths-ok: tests need the raw form',
    ].join('\n');
    expect(scanRust(src).map((x) => x.line)).toEqual([1, 2]);
  });
});

describe('check:paths script', () => {
  const run = (files) => {
    const root = mkdtempSync(join(tmpdir(), 'check-paths-'));
    try {
      for (const [f, c] of Object.entries(files)) {
        mkdirSync(join(root, f, '..'), { recursive: true });
        writeFileSync(join(root, f), c);
      }
      return spawnSync(process.execPath, ['scripts/check-paths.mjs', '--root', root], { encoding: 'utf8' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it('exits 1 with a list, skipping pathUtils, tests and paths.rs', () => {
    const r = run({
      'src/a.js': "x.split('/')",
      'src/utils/pathUtils.js': "x.split('/')",
      'src/a.test.js': "x.split('/')",
      'src-tauri/src/b.rs': 'p.canonicalize()',
      'src-tauri/src/paths.rs': 'p.canonicalize()',
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("src/a.js:1  split('/')");
    expect(r.stdout).toContain('src-tauri/src/b.rs:1  canonicalize()');
    expect(r.stdout).toContain('2 VIOLATION(S) in 2 file(s)');
    expect(r.stdout).not.toContain('pathUtils');
    expect(r.stdout).not.toContain('paths.rs');
  });

  it('exits 0 when clean', () => {
    expect(run({ 'src/a.js': 'const a = 1;' }).status).toBe(0);
  });

  it('scanRepo returns file, line and name', () => {
    const root = mkdtempSync(join(tmpdir(), 'check-paths-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.js'), "\nx.startsWith('/')");
    expect(scanRepo(root)).toEqual([{ file: 'src/a.js', line: 2, name: "startsWith('/')" }]);
    rmSync(root, { recursive: true, force: true });
  });
});
