import { expect, it } from 'vitest';
import { driftByChunk, overshootChunk } from './driftByChunk';
import { isReleaseBumpFile } from '../worklog/releaseFiles';

// Modelled on the 'Bolder UI' plan (p0pnmdi): chunk 7 planned 2 files and touched 43.
const ROOT = '/home/u/nevo-terminal';
const min = 60000;
const chunk = (n, files, extra = {}) => ({
  id: `c${n}`,
  n,
  title: `chunk ${n}`,
  files,
  status: 'implemented',
  prompts: [{ kind: 'chunk', at: n * 100 * min }],
  doneAt: n * 100 * min + 4 * min,
  ...extra,
});
const plan = {
  chunks: [
    chunk(1, ['src/index.css', 'DESIGN.md', 'src/themes/omarchy.test.js'], {
      prompts: [{ kind: 'chunk', at: 100 * min }, { kind: 'nudge', at: 102 * min }],
    }),
    chunk(3, ['src/index.css', 'DESIGN.md']),
    chunk(7, ['src/index.css', 'DESIGN.md']),
    chunk(9, ['src/index.css', 'src/components']),
    chunk(10, ['src/index.css'], { status: 'pending' }),
  ],
};
const sweep = Array.from({ length: 41 }, (_, i) => `src/features/f${String(i).padStart(2, '0')}.jsx`);
const byRepo = {
  c1: { [ROOT]: ['src/index.css', 'DESIGN.md', 'src/themes/omarchy.test.js', 'package.json'] },
  c3: { [ROOT]: ['src/index.css'] },
  c7: { [ROOT]: ['src/index.css', 'DESIGN.md', ...sweep, 'src-tauri/Cargo.toml'] },
  c9: { [ROOT]: ['src/index.css', 'src/components/Row.jsx', 'src/components/deep/Key.jsx', 'src/App.jsx'] },
  c10: { [ROOT]: ['src/index.css'] },
};

const rows = driftByChunk(plan, byRepo);
const row = (n) => rows.find((r) => r.n === n);

it('covers only implemented chunks with commits', () => {
  expect(rows.map((r) => r.n)).toEqual([1, 3, 7, 9]);
});

it('drops release bump files from touched', () => {
  expect(row(1).touched).not.toContain('package.json');
  expect(row(7).touched).toHaveLength(43);
  expect(isReleaseBumpFile('src-tauri/tauri.conf.json')).toBe(true);
  expect(isReleaseBumpFile('src/package.js')).toBe(false);
});

it('flags what was missed and what was extra', () => {
  expect(row(3)).toMatchObject({ planned: ['src/index.css', 'DESIGN.md'], touched: ['src/index.css'], missed: ['DESIGN.md'], extra: [] });
  expect(row(7).extra).toEqual(sweep);
  expect(row(1)).toMatchObject({ extra: [], missed: [] });
});

it('lets a folder entry match any file beneath it', () => {
  expect(row(9)).toMatchObject({ missed: [], extra: ['src/App.jsx'] });
});

it('times from the first prompt to done and spots nudges', () => {
  expect(row(1)).toMatchObject({ minutes: 4, nudged: true });
  expect(row(3)).toMatchObject({ minutes: 4, nudged: false });
});

it('picks the largest overshoot, or none', () => {
  expect(overshootChunk(rows).n).toBe(7);
  expect(overshootChunk(rows.filter((r) => r.n !== 7))).toBeNull();
});
