import { describe, it, expect } from 'vitest';
import { attachGit, parseCommits, parsePlanSubject, parseReleases } from './changesGit.js';

// Shaped like the real output of loadReleases / loadCommits (see their formats).
const s = (min) => 1795600000 + min * 60;
const RELEASES = [`v0.43.0\t${s(-60)}\t${s(-60)}\t`, `v0.44.0\t${s(30)}\t\t${s(30)}`];
const LOG = [
  `\x1erel1\t${s(30)}\tchore: release v0.44.0\n\n13\t0\tCHANGELOG.md\n1\t1\tpackage.json`,
  `\x1ebundle\t${s(20)}\tfeat: row menu and code comments\n\n7\t4\tsrc/tabs/RowMenu.jsx\n4\t1\tsrc/settings/SettingsDialog.jsx\n-\t-\tsrc/icon.png`,
  `\x1ebump\t${s(25)}\tbump versions\n\n2\t2\tpackage-lock.json\n1\t1\tsrc-tauri/Cargo.toml`,
  `\x1elater\t${s(40)}\tfix: row menu\n\n1\t1\tsrc/tabs/RowMenu.jsx`,
].join('\n');

const change = (id, startMin, files) => ({ id, start: s(startMin) * 1000, files });

describe('changesGit', () => {
  it('parses releases by tagged commit time, annotated or not', () => {
    expect(parseReleases(RELEASES)).toEqual([
      { tag: 'v0.43.0', at: s(-60) * 1000 },
      { tag: 'v0.44.0', at: s(30) * 1000 },
    ]);
  });

  it('omits release bump commits, by subject or by files', () => {
    expect(parseCommits(LOG).map((c) => c.sha)).toEqual(['bundle', 'later']);
  });

  it('splits a bundled commit per file and stops at the next release', () => {
    const commits = parseCommits(LOG);
    const [menu, comments, chat] = attachGit(
      [change('a', 0, ['src/tabs/RowMenu.jsx']), change('b', 5, ['src/settings/SettingsDialog.jsx']), change('c', 10, ['README.md'])],
      { releases: parseReleases(RELEASES), commits }
    );
    expect(menu).toMatchObject({ commits: ['bundle'], added: 7, removed: 4, lines: 11, version: 'v0.44.0', noCommit: false });
    expect(comments).toMatchObject({ commits: ['bundle'], lines: 5, version: 'v0.44.0', noCommit: false });
    expect(chat).toMatchObject({ commits: [], lines: 0, version: null, noCommit: true });
  });

  it('leaves the version null when no release followed yet', () => {
    const [c] = attachGit([change('a', 35, ['src/tabs/RowMenu.jsx'])], { releases: parseReleases(RELEASES), commits: parseCommits(LOG) });
    expect(c).toMatchObject({ commits: ['later'], lines: 2, version: null, noCommit: false });
  });

  it('lists test files and QA recipes', () => {
    const files = ['src/a.test.js', 'src/b.spec.tsx', 'tests/c.js', 'src/test/d.js', 'src/contest.js', 'qa/recipes/x.md', 'src/a.js'];
    const [c] = attachGit([change('a', 0, files)], {});
    expect(c.tests).toEqual(['src/a.test.js', 'src/b.spec.tsx', 'tests/c.js', 'src/test/d.js']);
    expect(c.qa).toEqual(['qa/recipes/x.md']);
  });

  it('parses plan commit subjects', () => {
    expect(parsePlanSubject('plan(changes-dialog): 4 — Tests and plan link')).toEqual({ slug: 'changes-dialog', n: 4, total: null, title: 'Tests and plan link' });
    expect(parsePlanSubject('plan(x): 2/7 — Two')).toEqual({ slug: 'x', n: 2, total: 7, title: 'Two' });
    expect(parsePlanSubject('feat: plan(x): 2 — no')).toBeNull();
  });

  it('links a plan commit and measures drift against the loaded plan', () => {
    const commits = parseCommits(`\x1ep4\t${s(5)}\tplan(dlg): 4 — Tests\n\n3\t0\tsrc/a.js\n2\t0\tsrc/a.test.js\n1\t0\tsrc/b.js`);
    const plans = [{ slug: 'dlg', chunks: [{ id: 'c3', n: 3 }, { id: 'c4', n: 4, files: ['src/a.js'], status: 'implemented' }] }];
    const [linked] = attachGit([change('a', 0, ['src/a.js'])], { commits, plans });
    expect(linked.plan).toEqual({ slug: 'dlg', n: 4, total: 2, title: 'Tests' });
    expect(linked.drift).toEqual({ named: 1, touched: 3, ratio: 3 });
    const [unloaded] = attachGit([change('a', 0, ['src/a.js'])], { commits });
    expect(unloaded).toMatchObject({ plan: { slug: 'dlg', n: 4, total: null }, drift: null });
  });

  it('gives a change with no commits empty checks and no plan', () => {
    const [c] = attachGit([change('a', 0, [])], {});
    expect(c).toMatchObject({ commits: [], tests: [], qa: [], plan: null, drift: null, noCommit: false });
  });
});
