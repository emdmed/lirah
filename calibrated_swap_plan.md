# Calibrated swap, round 4

Signed off on 2026-10-31 from the swap board
(https://claude.ai/artifact/JrY9FXo3SpmYsxWw6bjta1): all ten parts swap to
their calibrated twin. Builds on the swaps already done this week (FIG 06,
09, 16, 20, 21, 23), which added the vendored kit (`src/vendor/calibrated/`),
the token bridge and `CalRecipe` (`src/components/instrument/calibrated/`).

## Rules for every swap

- Keep each component's export name and props, so no caller changes.
- Keep pure data helpers other files import.
- Recipes go through `CalRecipe`; elements are used as custom elements
  inside a `.cal` wrapper (the token bridge).
- First draw plays the recipe's motion; live updates redraw still unless a
  `replayKey` or `transition` says otherwise.
- Compact density: recipes show `fallback`; elements use their own compact.
- No edits to the vendored kit or the calibrated repo inside a swap; a
  recipe gap is reported, then fixed upstream and re-vendored.

## Figures → recipes

| no | part | file | recipe | accepted losses |
|---|---|---|---|---|
| 01 | Auto merge | `src/features/git/Fig11Merge.jsx` | `merge` | top verdict tag; long commands clip |
| 02 | Race | `src/features/agent-jobs/Fig12Race.jsx` | `lanes` | late starts; failed × |
| 03 | Subagents | `src/components/Fig13Agents.jsx` | `fanout` | scales to ~58% in the sidebar |
| 04 | Daily budget | `src/features/token-budget/Fig14Budget.jsx` | `budget` | the used / limit · % readout line |
| 05 | Files by chunk | `src/features/plans/Fig22FilesByChunk.jsx` | `matrix` | "+N files" fold; wider |
| 06 | Sandbox | `src/features/settings/Fig10Sandbox.jsx` | `section` | layout stays hand-placed |

## Gauges → elements

| no | part | file | element | accepted losses |
|---|---|---|---|---|
| 07 | Meter | `src/components/instrument/Meter.jsx` | `<cal-meter>` | caution tone below the alert |
| 08 | Position | `src/components/instrument/Position.jsx` | `<cal-position>` | — |
| 09 | Diff bar | `src/components/instrument/DiffBar.jsx` | `<cal-diff>` | — |
| 10 | Spans | `src/components/instrument/Span.jsx` | `<cal-durations>` | per-row layout |

## Done when

- `npx vite build` passes.
- Each part renders in the dev figure sheet (`?figs&theme=rivendell`) or
  the instrument kit (`?kit`), checked by screenshot.

## Regression fixes (2026-10-31, after review)

Calibrated is an opinionated base: Lirah adapts it in its own code rather
than accept a regression. Lirah variants live in
`src/components/instrument/calibrated/recipes/` (the vendored kit and the
calibrated repo stay untouched).

| part | recipe | restores |
|---|---|---|
| Budget | `budgetToned` | used bar amber past 80%, red past 95%; toned alert lines; used box lifts clear of alert labels |
| Context | `measuredToned` | toned readout and used span, heavy-context tick |
| Context by source | `measuredToned` | hatched "sys + tools", largest-piece note |
| Race | `lanesToned` | late starts, failed lane in red with ×, stopped lanes muted |
| Plan timeline | `timelineToned` | n/N count, idle-gap break marks, "N left" tail, stuck chunk in amber |
| Subagents | `fanoutStacked` | full-width child boxes under 420px, AGENTS title |
| Meter | `<cal-meter>` + `calGauges.css` | whole fill and needle amber at warn/caution, red at fault |
| Diff bar | `diffRow` | readable at side 16–64, `fmt` and `values` honoured |
| Position | `positionRow` | caller's width (56px default) |
| Spans | `spanRow`, `spanRuler` | 14px rows, done/live/fault/muted tones, live star, `format` |

Still open: compact density shows the text fallback for every recipe figure.
