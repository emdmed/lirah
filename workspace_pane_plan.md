# Workspace pane: ease-of-use pass (proposals 01–11, rev B)

## Context
Two impeccable critiques of the right sidebar ([4] Workspace) scored it 24/40 and found two bugs. The eleven proposals in `workspace-pane-proposals.html` (rev B) were all signed off as **keep** on 2026-11-07. They keep the Instrument TUI look and only move, merge or relabel parts. With all of them applied, the second review projects about 31/40.

Ground rules:
- No new dependencies and no new components where one exists: `SegmentBank`, `EmptyLine` (`plans/parts.jsx:8`), `useAttentionQueue`, `RenameField`, `FrameHints` and the `KeyboardShortcutsDialog` sections are reused.
- One commit per step, in the order below. The two bug fixes go first and stand alone, so they can ship even if the later steps wait.
- Widths for 01, 02, 04 and 06 were measured with the app's fonts in a headless page, not in the app. Each of those steps ends with a check in a QA instance (`npm run qa -- --up` + `lirah qa snapshot`) at the default 256px pane width.

## Build order
| step | card | change | effort |
|---|---|---|---|
| 1 | 01a | `:jobs` opens jobs, add `:tabs` | xs |
| 2 | 04 | count each tab once, one word and colour per state | s |
| 3 | 03 | active row actions on hover/focus | xs |
| 4 | 05 | one jobs count, repo on cards, toast branch | m |
| 5 | 11 | TABS shows who is waiting | s |
| 6 | 01b | `[` `]` cycle sections, tablist | s |
| 7 | 06 | per-row key line, `?` opens help at a Workspace section | m |
| 8 | 07 | one "chosen" look | s |
| 9 | 10 | accessibility batch | s |
| 10 | 08 | scope captions, tasks copy | s |
| 11 | 02 | workspaces collapse only when they don't fit | m |
| 12 | 09 | one "+ new" row, one empty line | s |

---

## 1 · `:jobs` opens jobs, add `:tabs` (card 01, bug)
**Bug:** `useTabCommands.js:127` calls `requestJobsPane('toggle')` without a section. The handler at `RightSidebar.jsx:146` then takes the `!target` branch and folds the pane. `:plans` and `:tasks` pass their section (`plansPaneEvents.js:8`, `tasksPaneEvents.js:8`) and work.

**Change**
- `src/features/agent-jobs/jobsPane.js`: add a second parameter, `requestJobsPane(action = 'open', tab)`, which sends `{ action, tab }`. Add `requestTabsPane(action)` next to it, which sends `tab: 'tabs'`.
- `src/features/tabs/useTabCommands.js:127`: `requestJobsPane('toggle', 'jobs')`. Add a `tabs` command (hint "the workspace's tabs") that calls `requestTabsPane('toggle')`.
- Leave `usePaneShortcuts.js:32` (Alt+4, `requestJobsPane('open')` without a section) alone. It must keep the current section.

**Check:** with the pane open on tabs, `:jobs` switches to jobs, and a second `:jobs` folds the pane. `:tabs` behaves the same way. Alt+4 still focuses without switching section.

## 2 · Count each tab once (card 04, bug)
**Bug:** `permission` is in both `OWN_BUSY` and `YOUR_TURN` (`tabActivity.js:16,19`), so `tally()` (`TabsSummaryPane.jsx:42–53`) counts it as both "live" and "your turn", and "resting" comes out short.

**Change**
- `TabsSummaryPane.jsx` `tally()`: assign each kind to exactly one bucket, in this order:

  | bucket | kinds | colour |
  |---|---|---|
  | failed | `failed` | fault |
  | needs you | `permission` | warn |
  | your turn | `done` | ok |
  | working | `working`, `running`, `remote` | lamp |
  | idle | everything else, including hookless `waiting` and `idle` | muted |

  Export it so a test can import it.
- `ACTIVITY.permission` (`tabActivity.js:34`): `text-[var(--ins-fault)]` → `text-[var(--ins-warn)]`, matching `MasterStrip.jsx:16` and the queue numbers.
- `MasterStrip.jsx:24` `NODE_INK.waiting` (hookless agent at its prompt): word `idle`, and the empty outline `stroke: var(--ins-edge-strong)`, the same as `NODE_IDLE`. `done` keeps the ok outline and "your turn".
- `WorkspaceRow.jsx:48` waiting dot: replace the ok dot with the small outlined star from `ActivityGlyphs.StarOutline`, in warn when a `permission` tab is in that workspace and in ok otherwise.
- Leave the `OWN_BUSY` and `YOUR_TURN` sets alone; other code uses them (row folding through `LIVE`, auto-commit). Only the tally changes.

**Test (new):** `src/features/tabs/tally.test.js`. Each kind lands in exactly one bucket, the counts add up to the number of tabs, and `permission` counts only as "needs you".

**Check:** in a QA instance with six tabs, the footer adds up to six. Five words wrap to two lines at 256px, which is accepted.

## 3 · Active row actions on hover/focus (card 03)
- `TabRow.jsx:284`: `roleMenuOpen || active ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'` → `roleMenuOpen ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'`.
- Keyboard reach is unchanged: `f`, `x` and `t` (`TabRow.jsx:136–157`).
- Leave the branch wrap at `:328` as is.

**Check:** at rest the active row shows glyph, name, role chip and readout. Hovering or focusing it shows folder and ×. Other rows behave as before.

## 4 · Jobs: one count, repo on cards, correct toast (card 05)
- `RightSidebar.jsx:212`: add `reviewJobs`, the done jobs with changes not yet applied or discarded. Reuse whatever state the card already uses to decide that **Review N** or **Apply** shows (`:1019–1090`). Don't invent a new status.
- `TabButton` (`:820`): add an optional `lamp` prop that renders a small `<Lamp state="on" />` before the label. The jobs item becomes `count={runningJobs + reviewJobs}` with `lamp={runningJobs > 0}`.
- Collapsed job card, line 2 (`:938`): put the repo name first (`basename(job.cwd)`, or the repo root if the job has one), then `job.cli`. Show the primary action as a printed key (`[review N]`, or `[apply]` once reviewed) when the card is collapsed. It calls the same handler as the expanded button.
- Apply toast (`:274–278`): read the branch from the job's own folder (`job.cwd`), not from the active tab's `projectPath`.

**Check:** a running job and a finished one read `✦ jobs 2`. The collapsed card shows `api-repo · codex … [review 3]`, and applying a job from another repo names that repo's branch.

## 5 · TABS shows who is waiting (card 11)
- `RightSidebar.jsx:610`: `count={useAttentionQueue(workspaceTabs).length}`, the same queue that drives the row numbers and Alt+A (`useAgentAttention.js:57`).
- `TabButton`: add a `countTone` prop. Tabs uses `text-[var(--ins-warn)]`; the others keep foreground. The count still hides at 0.

**Check:** on the tasks section, a tab reaching "your turn" shows `tabs 1` in warn. Looking at that tab clears it, because the queue acknowledges what you look at.

## 6 · `[` `]` cycle sections (card 01)
- Pane `onKeyDown` (`RightSidebar.jsx:552`): before the `N` handler, if `e.key === '['` or `e.key === ']'`, and the target isn't a field or a dialog (same guard as `:556`), and Ctrl/Meta aren't held, move to the previous or next of the visible sections (`agents` only while it shows) and keep focus in the pane.
  - Match on `e.key`, not `e.code`, and don't reject `altKey`: on ISO layouts `[` and `]` are typed with AltGr, which reports as Ctrl+Alt on Windows and as Alt or AltGraph on Linux depending on the setup. Reject Ctrl/Meta only when `!e.getModifierState('AltGraph')`.
  - Test this in WebKitGTK on a Spanish layout.
- Switch row (`:609`): `role="tablist"` with an `aria-label`. `TabButton` gets `role="tab"` and `aria-selected` instead of `aria-pressed`, plus `aria-controls` pointing at the body (which gets an `id` and `role="tabpanel"`).
- The key hint comes in step 7.

**Check:** Alt+4, then `]` ×4 goes round tabs → jobs → plans → tasks → tabs. `[` goes back. Typing `[` in the tasks textarea doesn't switch.

## 7 · Per-row key line, `?` opens help (card 06)
- `TabsSummaryPane.jsx:233–244`: stop hiding the tally on focus (drop `group-focus-within/list:hidden`). Below it, while a row has focus, render one `FrameHints` line built from the keys that act on that row.
  - Move the conditions in `TabRow.jsx:136–157` into a small exported `rowKeys({ active, closable, edited, plans, summary })` that returns the applicable keys. Both `onKeyDown` and the hint line use it, so they can't drift.
  - The line shows `↵ switch`, the first one or two keys that apply, `[ ] section` and `? keys`.
- `?` while the pane has focus (same guard as step 6) opens the help dialog through the registry (`features/dialogs/registry.jsx:59`, `help`) with a `section: 'Workspace pane'` argument. `KeyboardShortcutsDialog.jsx` scrolls that section into view.
- `src/lib/shortcuts.js`: add a `Workspace pane` category (`[ ]` section, `j k` move, the row keys, `N` new job/plan, `?`). In `KeyboardShortcutsDialog.jsx`, add a glyph legend under that section with one row per `ACTIVITY` kind (`tabActivity.js:32–43`), rendered by the real icon components: working, running, other agent, your turn, needs you, failed, at its prompt, idle. Add the moon and the queue number.

**Test:** `rowKeys` for the active row has no `l`, and a row with no edits has no `a` or `e`.

**Check:** focusing a row keeps the tally and shows one hint line. `?` opens help at the Workspace section, and the legend draws all eight states.

## 8 · One "chosen" look (card 07)
- `TabButton` (`RightSidebar.jsx:826`): drop the gold text and gold border. Chosen = `text-foreground`, the latch tint `bg-[color-mix(in_srgb,var(--color-foreground)_6%,transparent)]` and a 1px ink underline, the same as `.ins-seg` in `SegmentBank`. Reuse that CSS rule rather than copying values: add a `.ins-seg-key[aria-selected="true"]` selector next to it in `index.css`.
- `TasksPane.jsx:333` `ScopeButton`: same treatment. Better still, replace both buttons with `SegmentBank` (`options: [{value:'project'}, {value:'global'}]`), which also gives arrow keys.
- `WorkspaceRow.jsx:43` already uses ink plus underline; check it matches.

**Check:** with no job running, there is no gold in the switch row or the tasks scope, and lamps are the only gold left in the pane.

## 9 · Accessibility batch (card 10)
- `TabRow.jsx:332`: branch text `text-muted-foreground/75` → `text-muted-foreground`.
- `RowAction.jsx`:
  - Rows are `role="option"`. Make the action spans plain `<span>`s with `aria-hidden="true"` and no role, since the row keys and the row's aria-label already expose them to screen readers.
  - Keep the click handlers.
  - Fix the stale comment at `RowAction.jsx:5`.
- `WorkspaceRow.jsx:48` waiting star: `role="img"`.
- Resize handle (`RightSidebar.jsx:598`):
  - `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow` = width, `tabIndex={0}`.
  - ← and → step 16px, with Shift for 64px, clamped to 224–560.
- Workspace rename:
  - F2 on a focused workspace button starts `RenameField`.
  - `:workspace rename <new name>` renames the current workspace (`useTabCommands.js:138`, parse the first word).

**Check:** `npm run check:contrast` passes, and Tab reaches the resize handle and arrows resize it. A screen reader reads each row once, without its buttons.

## 10 · Scope captions, tasks copy (card 08)
- A muted caption on each section's first header line:
  - plans: `· <repo name>` (PlansPane header, the `PLANS n` line)
  - jobs: `· all repos` (the span-ruler line above the list)
  - agents: `· all tabs` (AgentSidebar header)
  - tasks keeps its scope buttons, which already say the workspace.
- Copy fix:
  - `src/lib/shortcuts.js` `quick-task` note: "adds to this project's backlog" → "adds to this workspace's tasks".
  - Fix the same claim in PRODUCT.md (Tasks section) and in `useTabCommands.js:133`'s hint ("the project backlog").

**Check:** switching to a tab in another repo changes the plans caption, and the jobs caption stays.

## 11 · Workspaces collapse only when they don't fit (card 02)
- `WorkspaceRow.jsx`: measure with a `ResizeObserver` on the legend's right group. Re-measure when the workspace list or names change.
  - **Fits:** render as today.
  - **Doesn't fit:** render the active workspace (name and count) and a chip, `+N`, where N is the number of other workspaces, with the outlined star when one of them is in the attention queue.
- Chip behaviour:
  - **One other workspace:** click switches to it (one click, as today). Its title says which.
  - **Two or more:** click opens a menu in the existing popover style (reuse the `RoleMenu` pattern in `tabs/RoleMenu.jsx`). It lists each workspace with its count and waiting star, and has keys `n` (new), `r` (rename, through `RenameField`) and `x` (remove, with the existing confirm).
  - In both cases the chip's aria-label names the waiting workspaces.
- Legend status (`RightSidebar.jsx:568–571`): drop the `N running` / `N active` word. The JOBS item (step 4) and the AGENTS item carry those numbers. The legend lamp stays.
- Alt+W keeps cycling.

**Check (QA, required):**
- At 256px: two workspaces collapse to `main 4 +1`, and one click switches.
- Three workspaces open the menu.
- Widened to half the window, all of them show inline.
- No workspace or `+` is clipped at any width from 224 to 560.

## 12 · One "+ new" row, one empty line (card 09)
- A shared `NewRow({ label, keys, onClick })` in `src/features/plans/parts.jsx` next to `EmptyLine`: `+ new X ……… [key]`, in the style of the existing `+ new job N` row (`RightSidebar.jsx:698`).
- Use it for:
  - tabs, as the list's last row, replacing the `[+]` in the switch row (`:616`); key `Ctrl+T`
  - jobs (`:698`, already this shape); key `N`
  - plans, replacing `[+ new plan]`; add `N` in the pane's `onKeyDown` when `tab === 'plans'`
- Empty states:
  - jobs (`:666`), plans and agents (`AgentSidebar.jsx:170–179`, the Bot icon and two sentences) use `EmptyLine` with a one-line hint that names the key.
  - Tabs keeps its first-tab chooser.

**Check:** each section ends with the same row, and each empty section shows `-- no X --` plus a hint.

---

## Verification (whole branch)
1. `npm test`: the new tally and `rowKeys` tests pass.
2. `npx vite build` and `npm run check:contrast` pass.
3. QA instance, default width:
   - Run the `qa/` recipes that touch the workspace pane, tabs and jobs.
   - Walk Alt+4 → `]` → jobs → `[` → tabs → `?` → help.
   - Six tabs in two workspaces, one on a permission prompt: the footer adds up to six, TABS shows the waiting count from the tasks section, and the workspace chip carries the warn star.
4. Re-run `/impeccable critique` on `RightSidebar.jsx` and compare with 24/40.

## Left open
- AGENTS still doesn't fit the switch row at 256px when subagents exist. It overflows by about 60px after steps 4–5. Decide separately (fold it into the tabs rows, or show it only when widened).
- Whether the master strip earns its 36px before a master terminal exists (raised in the first review, out of scope here).
