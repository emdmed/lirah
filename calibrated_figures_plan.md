# Calibrated figures plan: a drawing set for the features that are hard to explain

> Design: "Lirah Calibrated · round 2" (artifact `H2r7PHbzH2oC6NVsvjJg7g`, v0.4.0 · rivendell · 2026-10-30).
> Branch: `plan/calibrated-figures-plan-a-draw`. Written 2026-10-31 against `e5410ea` (chunk 8).

## Summary

Lirah explains several features with lists, sentences or blocks of commands. The design replaces each one with a
line drawing ("figure") built from one small SVG kit, with a numbered `FIG.nn` label. A display setting
`figures: full | compact` picks between them: **full** draws the figure, **compact** keeps today's text. A figure
also falls back to the text when its container is too narrow.

Rules from the design that every chunk follows:

- **Only kit marks.** Ruler, leader, boxed value, dimension line, hatch, node, inset, numbered command, FIG label.
  Ink colours only, with the lamp for the one live thing.
- **Replace, don't add.** A figure takes the place of an existing bar, text line or list. It never adds a row, except
  FIG 15, 18 and 22, which the design marks as additions.
- **Data Lirah already has.** Where a figure needs new data, that data goes in its own commit before the UI.
- Mocks and screenshots for review use the Rivendell theme.

## Status

| # | Chunk | State |
|---|-------|-------|
| 1 | `figures` setting and Appearance row | done |
| 2 | Figure kit marks, registry and tokens | done |
| 3 | Figure wrapper and scale hook | done |
| 4 | FIG 09 auto-pilot loop figure | done |
| 5 | Counted sub-tab keys with plans count | done |
| 6 | Rust: last-turn cache token fields | done |
| 7 | FIG 06 context meter tooltip figure | done |
| 8 | Merge diff stat data for FIG 11 | done |
| 9–25 | see below | to do |
| 26–28 | FIG 17 and FIG 18 (in the design, missing from the running plan) | to do |

## Conventions (settled by chunks 1–8)

- **Setting.** `useSetting('figures')` from `features/settings/settingsStore`; values `'full'` (default) and
  `'compact'`. `figures` is in `CHOICES` in `features/agent-control/actions.js`.
- **Kit.** `src/components/instrument/figure/kit.jsx`, imported from `@/components/instrument/figure`. (The design
  says `instrument/figure-kit.jsx`; the code uses the folder.) Marks are SVG fragments in 1:1 user units.
  - Colours go through `style` via `INK`, so `var()` resolves in WebKitGTK.
  - Exports: `STROKE`, `DASH`, `CH = 6.6`, `textWidth()`, `T`, `FigLabel`, `Box`, `Leader`, `Dim`, `Node`, `Ruler`,
    `Hatch`, `Cmd`, `Inset`.
- **Registry.** `FIGURES` in `registry.js`, keyed by number. Numbers are stable: never reuse a dropped one. Keys:
  context 6, autopilot 9, sandbox 10, merge 11, race 12, agents 13, budget 14, keys 15, chunks 16, detail 19,
  timeline 20, plan-git 21, files-by-chunk 22. **17 and 18 are not registered yet** (chunk 26 adds them).
- **Wrapper.** `<Figure fig viewBox fallback minWidth paper className label>`.
  - Leave the top ~16 units of the viewBox for the FIG label.
  - The drawing never scales above 1:1. Below `minWidth` (default: the viewBox width) the fallback renders instead.
  - Compact mode returns `fallback` bare.
  - `paper` matches the host surface: `var(--ins-panel)` by default, `var(--ins-well)` in wells,
    `var(--ins-raised)` in tooltips.
- **Scale.** `useFigureScale(domainMax, x0, x1)`, clamped.
- **Inline-text pattern** (from FIG 09). The host reads `useSetting('figures')`. In full mode it drops the inline text
  from its row and draws the figure below, with that text as the figure's fallback.
- **Self-falling-back figures** (from FIG 06). When their data is missing (old sessions, git failure), figures return
  `fallback` themselves, so hosts always pass the compact text.
- **Verification per chunk:** `npm run build` passes. Each figure is rendered with Vite's `ssrLoadModule` against
  sample data, with `settingsStore` stubbed: SSR needs a `getServerSnapshot`. Check the full, compact and
  missing-data cases. The Tauri window can't be screenshotted from a session, so ask the user for a visual check of
  each figure.
- **Commits.** One per chunk: `plan(calibrated-figures-plan-a-draw): N — <title>` with `Decision:` lines and a
  `Plan-Chunk:` trailer.

## Remaining chunks

### 9 · FIG 11 merge plan figure
- **Where:** `src/features/git/AutoMergeDialog.jsx`, above "Will run". It replaces the "fast-forward" /
  "merge commit" word.
- **Draw:** the base lane and the feature lane from the fork point.
  - Base-only commits as nodes (`plan.behind`, collapsed to a count past 3); feature commits (`plan.ahead`).
  - Fast-forward: the base pointer slides to the feature tip. Merge: a merge diamond on the base lane.
  - Each step's command (`Cmd`, numbered) sits at the node where it acts: `git switch <base>` at the base tip,
    `git merge …` at the join, `git worktree remove …` beside the feature tip when `plan.featureWorktree` is set.
  - A boxed `n files · +a −r` from `plan.diffStat` (chunk 8). `null` means unknown: omit the box. Zeros mean no
    changes.
- **Keep:** the "Will run" block stays as selectable text in both modes.
- **New file:** `src/features/git/Fig11Merge.jsx`.
- **Done when:** fast-forward and merge-commit plans read differently at a glance; a worktree merge (`mergeDir`
  ≠ repo) labels the directory; compact is unchanged.

### 10 · Share WARN_AT threshold constant
- `Meter` hard-codes `warnAt = 0.8`; `TokenBudgetDialog.jsx:102` hard-codes "80% and 95%".
- Export `BUDGET_ALERTS = [0.8, 0.95]` from `src/features/token-budget/` (next to the budget alert code). Use it in
  `Meter`'s default, in the dialog sentence and in whatever fires the alert toasts.
- No visual change.

### 11 · FIG 14 budget ruler with daily pace
- **Where:** `TokenBudgetDialog.jsx`. It replaces the sentence "Alerts show at 80% and 95%".
- **Draw:**
  - A ruler 0 → daily limit with today's used span lit, and the two alert ticks from `BUDGET_ALERTS`.
  - A dashed `DASH.long` line from "now" carrying the pace (`used ÷ hours since local midnight`) to midnight.
  - A boxed note where the pace crosses the first alert (`crosses 80% at 17:40`), or `stays under` when it doesn't.
- **Edge cases:** no limit set → fallback; under 15 minutes since midnight → no pace line (too noisy).
- **New file:** `src/features/token-budget/Fig14Budget.jsx`.

### 12 · Rust: sandbox spec struct and command
- Today `SANDBOX_SPEC` is a hard-coded list in `src/features/settings/SettingsDialog.jsx:39`.
- **Rust:** expose the bwrap binds the PTY spawner already builds as `get_sandbox_spec(project_path) ->
  SandboxSpec { writable: Vec<String>, read_only: Vec<String>, protected: Vec<String>, cleared_env: bool,
  network_isolated: bool, not_covered: Vec<String> }`. Derive it from the same function that builds the bwrap
  args, so it can't drift. Add a unit test against that builder.
- **JS:** a hook `useSandboxSpec(projectPath)`. No UI change yet.

### 13 · FIG 10 sandbox section drawing
- **Where:** Settings → Sandbox (replaces the `SANDBOX_SPEC` list) and the `SandboxSwitch` tooltip in `StatusBar.jsx`.
- **Draw:** nested regions.
  - System root, hatched (read-only). Home inside it, clear (writable), with the dotted protected islands
    (`.ssh`, `.gnupg`, rc files) hatched inside home. The project folder inside home, clear.
  - Cleared env and network as boxed notes on the boundary.
  - Not covered (secondary terminal, background jobs) as boxes outside the boundary.
- Falls back to today's list when the command fails.
- **New file:** `src/features/settings/Fig10Sandbox.jsx`.

### 14 · FIG 13 subagent fan-out
- **Where:** `src/components/AgentSidebar.jsx`. It replaces the dot + metadata rows.
- **Draw:** the main session node on the left and a fan of leaders, one per subagent. Each ends in a two-line `Box`:
  the task, then `tool · messages · elapsed`. The running branches are lit; finished ones settle to ink and fold into
  `+n done` after the newest 2.
- **Data:** as today (task, last tool, message count, start).
- **Height:** grows with running subagents. Cap at 6 branches and fold the rest.

### 15 · FIG 12 race lanes
- **Where:** `src/features/agent-jobs/RaceCompareDialog.jsx` header. It replaces the per-candidate status lines.
- **Data:** check that each candidate has its start/end, TypeScript check result and diff stat. If not, add them to
  the race job record in its own commit before this one (reuse `parseShortstat` from `useAutoMerge.js`).
- **Draw:**
  - A minutes ruler; one lane per agent with a `Dim` for its duration.
  - At the lane end: a boxed `tsc ✓/✗ · +a −r`.
  - The running lane is lit and its end is `DASH.fine` up to now.

### 16 · shortcuts: boundKeysFor helper
- In `src/lib/shortcuts.js`, add `boundKeysFor(modifier)`: the keys bound under a held modifier, with their command
  label, read from the existing `SHORTCUTS` registry.
- Add a small test in the style of the existing shortcut code.

### 17 · FIG 15 keyboard plate
- **Where:** the help dialog (^H), top of the list, shown while Ctrl (or Alt) is held. It adds a view; the hint bar
  stays.
- **Draw:** a QWERTY plate of `Box` keycaps. Bound keys are outlined in ink, with a leader to their label in the
  margin; unbound keys are faint. Built only from `boundKeysFor`, so it can't drift from the registry.
- The ■■■ effort item: layout the leaders so they don't cross (labels stacked per keyboard row, left/right halves).

### 18 · FIG 16 chunk ruler in tab plan tier
- **Where:** `src/features/plans/TabPlanTier.jsx`. It replaces the block bar and "11/15 chunks".
- **Draw:**
  - A line of chunk `Node`s: done filled, live is the lamp star, the rest outlined.
  - A `Dim` over the done span with its elapsed time, and `~40m to go` (mean done-chunk duration × remaining).
- **Data:** chunk commit times. Use what auto-pilot already records on the chunk; if missing, read commit dates by
  `Plan-Chunk` trailer.
- The tab row is narrow, so set an explicit `minWidth` and keep a fallback.

### 19 · FIG 21 plan branch with chunk commits
- **Where:** the `PlanDetail` git block (`PlanGitSection.jsx`). It replaces the GIT rows.
- **Draw:**
  - The base lane, the plan branch, and one node per chunk commit, numbered by its `Plan-Chunk` trailer.
  - A boxed `in place` / `worktree <dir>`.
  - Several repos stack as lanes.
- **Data:** `planGit.js` (setup) + commits by trailer.

### 20 · FIG 20 plan timeline
- **Where:** the `PlanDetail` header and `AutopilotStrip`. It replaces the block bar and the "complete in" line.
- **Draw:**
  - A minutes ruler; each chunk is a span from its start to its commit node.
  - A `Dim` for the whole plan.
  - A boxed leader on the slowest chunk.
- Sits beside FIG 09 in the strip: when both apply, FIG 09 shows while running and FIG 20 once complete.

### 21 · usePlanCommitFiles hook
- `usePlanCommitFiles(plan)`: for each chunk commit (found by trailer), the files it touched (`git show
  --name-only --format= <sha>` via `gitLines`).
- Cache by sha: commits never change.
- Lives next to `usePlanFiles.js`.

### 22 · FIG 22 files-by-chunk grid
- **Where:** above CHUNKS in `PlanDetail`; folds away with the header.
- **Draw:**
  - Chunks down, files across (files touched by 2+ chunks first), and a mark where a chunk touched a file.
  - Shared columns get an ink outline, so "chunks 1, 7 and 8 all edit settingsStore.js" is one column.
  - More than ~16 files: show the shared ones and a `+n` box.

### 23 · levelTokens data for file detail levels
- **Data:** for a file, the token size at each detail level (full · signatures · skeleton) from the compact pass,
  using the same estimate the chip already shows for its current level.
- Return `{ full, signatures, skeleton, default }`.

### 24 · FIG 19 detail levels in file chip popover
- **Where:** the file row tooltip and the context chip's detail readout. It replaces the
  "full · signatures · skeleton" words.
- **Draw:** one ruler 0 → full size, with a `Dim` per level labelled with its tokens and its factor (`× 0.3`). The
  default level for this file's size is boxed.

### 25 · Polish pass and docs
- Review every figure at 100% and at its `minWidth`, in light and dark Rivendell and one other theme.
- Check that every figure's `label` reads as a sentence for screen readers.
- Document the kit and the figure list (number, host, fallback, data) in `docs/`.
- Run `npm run build` and `cargo test`.

## Not in the running plan: FIG 17 and FIG 18

The design has 16 figures. The running 25-chunk plan covers 14, leaving out **17** (same-repo bracket) and **18**
(folder weight). Both need work the design understates.

### 26 · Register FIG 17 and FIG 18
- Add `17: { key: 'same-repo', title: 'SAME REPO' }` and `18: { key: 'folder-weight', title: 'FOLDER WEIGHT' }` to
  `registry.js`.

### 27 · FIG 17 same-repo bracket in the tabs list
- **Design vs code:** the design says this replaces an "also working here" line. That line doesn't exist. What
  exists is TabRow's Tier 5 (`TabRow.jsx:311`, built by `remoteWork` in `tabActivity.js`), which shows another tab's
  agent working in *this* repo (cross-repo reach). That is a different fact, so **keep Tier 5**. The bracket adds the
  same-repo overlap the design describes, drawn in the gutter, so it adds no row.
- **Data:** group tabs by `useRepoRoots(paths)` (`src/features/plans/planRepoRoot.js:37`). Groups of 2+ tabs get a
  bracket.
- **Draw:** in `TabsSummaryPane.jsx`, an absolutely positioned SVG in the left gutter spanning the rows of each group
  (row rects measured with a ResizeObserver), with the group's count in a box. Non-adjacent rows still get one
  bracket, with a tick at each member row.
- In compact mode: nothing (no text existed).

### 28 · FIG 18 folder weight bracket
- **Data first (own commit):** tree entries have no size today (`DirectoryEntry` in `src-tauri/src/fs/directory.rs`
  has name/path/is_dir only), so the design's "the watcher has sizes" claim doesn't hold.
  - Add a command `folder_weight(path) -> { files, bytes }`. It walks with the same ignore rules as the tree, is
    cached, and is invalidated by the file watcher.
  - Convert to tokens with the existing 4-chars-per-token estimate (`CHARS_PER_TOKEN` in
    `src/features/token-budget/TokenCostEstimate.jsx`). Move that constant somewhere shared rather than copying it.
- **UI:** `src/components/file-tree/FolderNode.jsx`.
  - An open folder row shows `n files · ~41k tok` in its empty right side (after `AgentMark`).
  - A thin bracket down the right edge spans its visible children. The tree is virtualised (`FileTree.jsx` sets row
    heights), so draw the bracket per row as a right-edge segment, not one tall SVG.
- Respect the file-tree rule: **never auto-expand folders**; the figure only decorates folders the user opened.

## Risks

- **Narrow hosts.** TabPlanTier, AgentSidebar and the tabs gutter are narrow. Each of those figures needs an explicit
  `minWidth` and a tested fallback.
- **Live re-render cost.** FIG 13, 16 and 20 update while agents run. Memoize on the data that draws them, not on
  clocks. Tick elapsed labels at most once a second.
- **Missing data in old plans/sessions.** Every figure falls back to its compact text instead of drawing zeros.
