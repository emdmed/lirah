# Calibrated round 3 plan: seven more figures and the shared parts

> Design: "Lirah Calibrated · round 3 + house style" (artifact `H2r7PHbzH2oC6NVsvjJg7g`), signed off 2026-10-31.
> Branch: `plan/calibrated-figures-plan-a-draw`. Follows `calibrated_figures_plan.md` (round 2, chunks 1–25, done).
> Mock screenshots, one per card: `/tmp/claude-1000/-home-enrique-projects-nevo-terminal/88df1b83-7f92-4290-b70a-4f96cb3e95e4/scratchpad/shots/<key>.png`.

## Sign-off

| Kept | Dropped |
|------|---------|
| FIG 23 context sources, 24 prompt cost, 25 diff minimap, 26 job isolation, 29 spend by model, 31 subject ruler, 32 files by intent | FIG 27 files by job, 28 element spans, 30 hooks in one turn |
| P0 compact = marks, P1 meter scale, P3 Position, P4 chunk nodes, P5 diff pair, P6 durations | P2 counts in a box |

FIG 27, 28 and 30 are never reused (see `registry.js`).

## Rules (round 2 conventions still apply)

- Only kit marks from `@/components/instrument/figure`, ink colours, the lamp for the one live thing.
- A figure replaces text that is already there, from data Lirah already has.
- **P0 changes compact mode.** `figures: compact` no longer swaps a figure back to text. Both modes draw:
  - **full** prints the scale, boxes the value and adds leaders;
  - **compact** keeps the marks (nodes, spans, ticks) and drops their labels, boxes and the FIG label; the value moves
    to the tooltip.
  - Mechanics (chunk 1): `Figure` takes `compactViewBox` (and optional `compactMinWidth`). With it, compact mode draws
    the children in that box, without the FIG label, with `label` as the `title` tooltip. Figures read
    `useFigureCompact()` to decide what to drop. `compactViewBox` defaults to `viewBox`; since chunk 14
    every figure has a compact form and compact never swaps to `fallback`.
  - `fallback` stays for missing data and too-narrow containers.
- Shared parts (P1, P3, P5, P6) live in `src/components/instrument/` and are plain components, not `Figure`s (no FIG
  label). They read `useFigureCompact()` for their compact form.
- **Verification per chunk:** `npm run build` passes. Add each new figure or part to the dev figure sheet
  (`src/dev/FigureSheet.jsx`, `?figs&theme=rivendell`) with mock data, in full and compact. Run Vite on a free port
  and screenshot the sheet with Playwright + `/usr/bin/chromium`. Compare with the mock screenshot.
- **Commits:** one per chunk, `plan(calibrated-round3): N — <title>`, with `Decision:` lines.

## Chunks

| # | Chunk | Lane | State |
|---|-------|------|-------|
| 1 | P0 base: compact draws marks; register FIG 23–32 | — | done |
| 2 | P1 Meter with a printed scale | A | done |
| 3 | FIG 23 context sources on one ruler | A | done |
| 4 | FIG 24 prompt cost chain | A | done |
| 5 | FIG 29 spend by model | A | done |
| 6 | FIG 32 attached files by intent | A | done |
| 7 | P5 DiffBar as a dimension pair | B | done |
| 8 | FIG 25 diff minimap with a scale | B | done |
| 9 | FIG 31 subject on a character ruler | B | done |
| 10 | P3 Position part | B | done |
| 11 | P4 chunk progress as nodes everywhere | C | done |
| 12 | P6 durations on a shared ruler | C | done |
| 13 | FIG 26 where a job is allowed to write | C | done |
| 14 | P0 retrofit: compact forms for FIG 06–22 | — | done |
| 15 | Docs and polish | — | to do |

Lanes A, B and C touch mostly separate files and run in parallel worktrees; they merge back before 14.

### 2 · P1 Meter with a printed scale
- `src/components/instrument/Meter.jsx` + its CSS. `size="lg"` in full mode: number the major ticks (0, 50%, max),
  print the alert threshold's value at `warnAt`, box the reading on a leader from the needle.
- Compact (and every non-lg size): exactly today's meter.
- Lands in the status bar context gauge, `TokenBudgetDialog`, `ContextBreakdown`; check each still fits its row.

### 3 · FIG 23 context sources on one ruler
- **Where:** `src/features/token-budget/ContextPeek.jsx`, under FIG 06.
- **Replaces:** the per-source rows, "+N more" and "Largest pieces".
- **Draw:** one strip on a token ruler; each source is a span whose width is its share, with a boxed value
  (name · tokens · %) on a leader. The part the transcript can't account for is hatched. The largest single piece hangs
  off its source with a leader.
- **Data:** `useContextBreakdown` groups and items.
- **Compact:** the strip and its divisions only.

### 4 · FIG 24 prompt cost chain
- **Where:** the `TokenCostEstimate` tooltip (`src/features/token-budget/TokenCostEstimate.jsx`).
- **Replaces:** the per-section lines and the "Measured on…" sentence.
- **Draw:** a dimension chain, one span per payload part (prompt, files, template, system) with the total as the outer
  dimension. A dashed, unmeasured tail for what the agent reads later. Underneath, the day's budget ruler showing where
  this prompt lands (only when a daily budget is set).
- **Data:** `promptBase.sections`, `SYSTEM_OVERHEAD`, budget.

### 5 · FIG 29 spend by model
- **Where:** `src/features/token-budget/TokenDashboard.jsx` overview.
- **Replaces:** "By Model" and "Cost Breakdown".
- **Draw:** one proportioned bar on a dollar ruler; one span per model with a boxed value (model · cost · tokens); the
  total is the dimension over all of it.
- **Data:** `modelBreakdown`, `totalStats`.

### 6 · FIG 32 attached files by intent
- **Where:** `FileTally` in `src/components/textarea-panel/ContextStatus.jsx`.
- **Replaces:** the "12 files: 8 EDIT · 3 READ · 1 COPY" sentence.
- **Draw:** one node per file, grouped by intent, a dimension over each group with its count and intent. EDIT is
  filled ink, READ an outline, COPY hatched.
- **Data:** `fileStates`.

### 7 · P5 DiffBar as a dimension pair
- `src/components/instrument/DiffBar.jsx`: two spans out from a centre tick, added to the right, removed to the left,
  linear to 200 lines and logarithmic past it, with the 200 point marked. Full prints both values at the span ends;
  compact keeps the spans and the 200 mark.
- Callers that print `+A −R` today use it: job cards, tab row readout, auto commit header, diff dialog status,
  `GitStatsBadge` / file tree badges. Keep each host's width budget; where a host is too narrow, keep the text.

### 8 · FIG 25 diff minimap with a scale
- **Where:** the `DiffContent` minimap; `GitDiffDialog` notes.
- **Replaces:** the unscaled strip, the "N unchanged lines" rows' role in the map, the L12-18 note list.
- **Draw:** a vertical line ruler; each change a span with its line range and size; folded stretches hatched with their
  length; the on-screen bracket from `visibleRange`; review notes hang off their lines on leaders.
- Drops the hard-coded rgba colours for theme tokens.
- **Data:** `diffChunks`, `totalLines`, `visibleRange`, `fileNotes`.

### 9 · FIG 31 subject on a character ruler
- **Where:** `src/features/git/AutoCommitDialog.jsx`, under the subject.
- **Replaces:** the "Keep the first line under 72 characters" tooltip.
- **Draw:** a ruler with a tick per character; 50 marked as the target, `SUBJECT_MAX` (72) as the limit; a dimension
  for the length. Characters past the limit sit beyond the limit line in the fault colour.

### 10 · P3 Position part
- New `src/components/instrument/Position.jsx`: `index`, `count`. A short ruler with one tick per item, the current one
  filled. Above ~24 items the ticks merge into a scale with a marker. Full adds the boxed `3/7`; compact is ticks only.
- Lands in: `GitDiffDialog` files, `MarkdownViewerDialog`, `RaceCompareDialog`, terminal search matches, the files
  pane cursor. Replaces each `3/7` text.

### 11 · P4 chunk progress as nodes everywhere
- `ProgressReadout` in `src/features/plans/parts.jsx`: the cell bar + "11/15 chunks" becomes the FIG 16 node line:
  filled done, outlined to-do, a fault square for a chunk that needs you, the lamp star only while a chunk runs. Full
  adds the boxed `11/15` and the done dimension; compact is the nodes.
- Lands in `PlanRow`, `PlanDetail`, and `TabPlanTier`'s compact branch.

### 12 · P6 durations on a shared ruler
- New `Span` part plus a list-level scale (`src/components/instrument/Span.jsx`): when several durations sit in one list
  they share a minutes ruler at the top; each row draws its time as a dimension line. A running item ends in a dashed
  lamp tail that grows (ticked at most once a second). Full prints the scale and each value; compact keeps the lines
  and the value on the right.
- Lands in `RightSidebar` job cards, `ChunkRow` "took", and FIG 12's race lanes (share the scale helper).
- **Data:** `startedAt`, `endedAt`.

### 13 · FIG 26 where a job is allowed to write
- **Where:** `src/features/agent-jobs/RunJobDialog.jsx`, the isolation block.
- **Replaces:** the warning paragraph and "Race · N candidates".
- **Draw:** two small section drawings in FIG 10's vocabulary: a worktree job writes on its own branch beside your tree;
  an in-place job writes straight into it. The chosen mode is framed. The race count as the sum it is
  (`claude ×2 + codex ×1 = 3`).
- **Data:** `useWorktree`, `clis`, `copies`, candidate count.

### 14 · P0 retrofit
- Give every round-2 figure (06, 09–16, 19–22) a `compactViewBox` and a compact form (marks only), and remove the
  hosts' compact text branches. Keep `fallback` for missing data and narrow containers.
- Then drop the "no `compactViewBox` → fallback" path from `Figure`.

### 15 · Docs and polish
- Figure sheet: every figure in full and compact; check light and dark Rivendell and one other theme.
- `label` reads as a sentence for every figure.
- `npm run build`, `cargo test`.
