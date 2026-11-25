import { describe, it, expect } from 'vitest';
import { groupChanges } from './changes.js';

const featureMap = {
  features: [
    { id: 'tabs', files: ['src/features/tabs/TabRow.jsx', 'src/features/tabs/RowMenu.jsx', 'src/features/tabs/RoleMenu.jsx', 'src/features/tabs/ProjectTab.jsx'] },
    { id: 'settings', files: ['src/features/settings/SettingsDialog.jsx', 'src/features/settings/settingsStore.js', 'src/features/settings/settingsSections.js'] },
    { id: 'plans', files: ['src/features/plans/planPrompts.js', 'src/features/plans/ChunkRow.jsx'] },
  ],
};

// A made-up morning shaped like a real one: tabs work, a settings change, ship it, plans work, ship it.
const MORNING = [
  { id: 'm1', at: 1795597318955, endedAt: 1795597394805, prompt: "add a git diff button to the tab rows", files: ["src/features/tabs/TabRow.jsx", "src/features/tabs/TabsSummaryPane.jsx", "src/features/tabs/rowKeys.js"] },
  { id: 'm2', at: 1795597478938, endedAt: 1795597513360, prompt: "the button vanishes on hover", files: ["src/features/tabs/TabRow.jsx"] },
  { id: 'm3', at: 1795597563064, endedAt: 1795597594951, prompt: "the buttons move, keep them still", files: ["src/features/tabs/TabRow.jsx"] },
  { id: 'm4', at: 1795597642660, endedAt: 1795597720695, prompt: "put these buttons in a dropdown", files: ["src/components/icons/index.jsx", "src/features/tabs/RoleMenu.jsx", "src/features/tabs/RowMenu.jsx", "src/features/tabs/TabRow.jsx"] },
  { id: 'm5', at: 1795597756539, endedAt: 1795597785961, prompt: "clicking it expands the tab too", files: ["src/features/tabs/TabsSummaryPane.jsx"] },
  { id: 'm6', at: 1795597807024, endedAt: 1795597998714, prompt: "polish the dropdown", files: ["src/features/tabs/RoleMenu.jsx", "src/features/tabs/RowMenu.jsx"] },
  { id: 'm7', at: 1795598068625, endedAt: 1795598138923, prompt: "add a code comments setting", files: ["src-tauri/src/lirah_cli.js", "src/features/agent-control/actions.js", "src/features/settings/SettingsDialog.jsx", "src/features/settings/settingsSections.js", "src/features/settings/settingsStore.js", "src/features/tabs/ProjectTab.jsx", "src/features/tabs/launchOptions.js", "src/features/tabs/launchOptions.test.js"] },
  { id: 'm8', at: 1795598272525, endedAt: 1795598324350, prompt: "ship it", files: ["package-lock.json", "package.json", "src-tauri/Cargo.lock", "src-tauri/Cargo.toml", "src-tauri/tauri.conf.json"] },
  { id: 'm9', at: 1795598404886, endedAt: 1795598433281, prompt: "make plan decisions easier to read", files: ["src/features/plans/planPrompts.js"], flags: [{ n: 'F1', text: 'old plans keep unnumbered decisions' }, { n: null, text: 'tests not run' }], assumptions: ['D numbers restart per plan'] },
  { id: 'm10', at: 1795598448218, endedAt: 1795598453547, prompt: "show me an example of how it would look", files: [], decisions: ["examples only, nothing built"] },
  { id: 'm11', at: 1795598467793, endedAt: 1795598501957, prompt: "number the decisions D1, D2", files: ["src/features/plans/ChunkRow.jsx", "src/features/plans/planPrompts.js", "src/features/plans/planPrompts.test.js"], decisions: ["plan decisions carry numbers like D1, D2."] },
  { id: 'm12', at: 1795598530112, endedAt: 1795607757925, prompt: "ship it", files: ["CHANGELOG.md", "package-lock.json", "package.json", "src-tauri/Cargo.lock", "src-tauri/Cargo.toml", "src-tauri/src/lirah_cli.js", "src-tauri/tauri.conf.json", "src/components/icons/index.jsx", "src/features/agent-control/actions.js", "src/features/plans/ChunkRow.jsx", "src/features/plans/PlanDetail.jsx", "src/features/plans/planPrompts.js", "src/features/plans/planPrompts.test.js", "src/features/settings/SettingsDialog.jsx", "src/features/settings/settingsSections.js", "src/features/settings/settingsStore.js", "src/features/tabs/ProjectTab.jsx", "src/features/tabs/RoleMenu.jsx", "src/features/tabs/RowMenu.jsx", "src/features/tabs/TabRow.jsx", "src/features/tabs/TabsSummaryPane.jsx", "src/features/tabs/launchOptions.js", "src/features/tabs/launchOptions.test.js", "src/features/tabs/rowKeys.js", "src/hooks/useArrived.js", "src/index.css"] },
].map((e) => ({ ...e, repo: '/r', cwd: '/r', branch: 'main' }));

const t = (min) => new Date(2026, 10, 25, 9, min).getTime();
const turn = (id, min, prompt, files, over) => ({ id, at: t(min), endedAt: t(min) + 1000, prompt, repo: '/r', cwd: '/r', files, ...over });

describe('groupChanges', () => {
  it('groups a morning into row menu, code comments setting and numbered decisions', () => {
    const { changes, talk, talkItems, unmapped } = groupChanges(MORNING, { featureMap });
    expect(changes.map((c) => c.prompts[0].slice(0, 20))).toEqual(['add a git diff butto', 'add a code comments ', 'make plan decisions ']);
    const [menu, comments, decisions] = changes;
    expect(menu.turns).toBe(6);
    expect(menu.files).toContain('src/features/tabs/RowMenu.jsx');
    expect(menu.feature).toBe('tabs');
    expect(comments.turns).toBe(1);
    expect(comments.feature).toBe('settings');
    expect(comments.features).toEqual(['settings', 'tabs']);
    expect(decisions.turns).toBe(2);
    expect(decisions.feature).toBe('plans');
    expect(decisions.decisions).toEqual(['plan decisions carry numbers like D1, D2.']);
    expect(decisions.flags).toEqual([
      { n: 'F1', text: 'old plans keep unnumbered decisions', entry: 'm9', at: MORNING[8].at, session: null },
      { n: null, text: 'tests not run', entry: 'm9', at: MORNING[8].at, session: null },
    ]);
    expect(decisions.assumptions).toEqual([{ text: 'D numbers restart per plan', entry: 'm9', at: MORNING[8].at, session: null, i: 0 }]);
    expect(menu.flags).toEqual([]);
    expect(menu.assumptions).toEqual([]);
    // ship it belongs to no change; "show me an example" is talk
    expect(changes.flatMap((c) => c.files)).not.toContain('package.json');
    expect(talk).toEqual({ '2026-11-25': 1 });
    expect(talkItems).toEqual({ '2026-11-25': [{ kind: 'decision', text: 'examples only, nothing built', at: MORNING[9].at, entry: 'm10' }] });
    expect(unmapped).toContain('src/features/tabs/TabsSummaryPane.jsx');
    expect(unmapped).not.toContain('src/features/tabs/TabRow.jsx');
  });

  it('ship it closes the open change, so the same file starts a new one', () => {
    const { changes } = groupChanges([turn('a', 0, 'fix x', ['x.js']), turn('s', 1, 'Ship this', []), turn('b', 2, 'fix x again', ['x.js'])]);
    expect(changes.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('adds a follow-up with no files to the newest open change, else it is talk', () => {
    const { changes, talk } = groupChanges([
      turn('a', 0, 'plan x', ['x.js']),
      turn('b', 1, 'yes', []),
      turn('c', 2, 'what does y do?', []),
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ turns: 2, prompts: ['plan x', 'yes'], end: t(1) + 1000 });
    expect(talk).toEqual({ '2026-11-25': 1 });
  });

  it('without a session, a gap over 20 minutes in the same cwd starts afresh', () => {
    const { changes } = groupChanges([turn('a', 0, 'fix x', ['x.js']), turn('b', 10, 'more x', ['x.js']), turn('c', 40, 'x again', ['x.js'])]);
    expect(changes.map((c) => [c.id, c.turns])).toEqual([['a', 2], ['c', 1]]);
  });

  it('keeps sessions apart even in the same cwd, and ignores gaps inside a session', () => {
    const { changes } = groupChanges([
      turn('a', 0, 'fix x', ['x.js'], { session: 's1' }),
      turn('b', 1, 'fix x too', ['x.js'], { session: 's2' }),
      turn('c', 50, 'x once more', ['x.js'], { session: 's1' }),
    ]);
    expect(changes.map((c) => [c.id, c.session, c.turns])).toEqual([['a', 's1', 2], ['b', 's2', 1]]);
  });
});
