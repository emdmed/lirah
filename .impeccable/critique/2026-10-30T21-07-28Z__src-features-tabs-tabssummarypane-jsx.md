---
target: workspace tab list
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/enrique/projects/nevo-terminal/src/features/tabs/TabsSummaryPane.jsx"
target_fingerprint: "sha256:2d60dc6ef6996699018a1b0d08460d8a29fa557e45a1bb2c977683e611931c45"
target_path: /home/enrique/projects/nevo-terminal/src/features/tabs/TabsSummaryPane.jsx
timestamp: 2026-10-30T21-07-28Z
slug: src-features-tabs-tabssummarypane-jsx
---
# Critique: Workspace → TABS list (TabsSummaryPane / TabRow)
Method: dual-agent. Score 26/40 (Good).

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | live "this turn" trail styled same as settled "last turn" (TurnTrail.jsx:16) |
| 2 | Match real world | 3 | "ran 17" unitless; "tag" ≠ repo role |
| 3 | User control | 3 | middle-click close unannounced |
| 4 | Consistency | 2 | no j/k like plans; lucide bubble among stars; boxed tag chip |
| 5 | Error prevention | 3 | hover hides diff as × appears |
| 6 | Recognition | 2 | states and moon only in tooltips |
| 7 | Flexibility | 2 | no in-pane keys; row actions unreachable by keyboard |
| 8 | Minimalist | 3 | settled history unfolded; +146812 loudest pixel |
| 9 | Error recovery | 3 | autopilot pauses surface in well |
| 10 | Help | 2 | instructions only in title tooltip |

Specificity: authored for Lirah (star glyphs, moon, segmented chunk bar); generic leaks: MessageSquareMore waiting glyph (tabActivity.js:29), boxed tag chip.
Detector: 0 findings. CSS spot-check: 10px text (RoleMenu.jsx, TabsSummaryPane.jsx:145,148, TabRow.jsx:99); text-faint on meaningful loose-plans count (TabsSummaryPane.jsx:145).

## Priority issues
- [P1] No keyboard model; hover-only actions (TabRow.jsx:56, :152). Fix: roving focus, j/k, x/l/t/r/a/o keys, group-focus-within, FrameHints. /impeccable harden
- [P1] Hover swaps diff+moon for actions (TabRow.jsx:138/152). Fix: keep readout, actions left of it. /impeccable layout
- [P1] Settled history unfolded (TabPlanTier.jsx:37, old turn trails). Fix: fold finished plans to one line; fade/hide trails >1h. /impeccable distill
- [P2] Glyphs don't answer "who needs me" — waiting bubble vs done star; running trail not lamp-tinted. Fix: star-family waiting glyph, lamp tint, time-in-state, legend summary, dim idle rows. /impeccable clarify, colorize
- [P2] Diff numbers unscaled/misaligned (TabRow.jsx:143). Fix: compact +147k, fixed-width right column. /impeccable layout

## Persona red flags
- Power user: no keyboard triage, tab order not attention order, diffs outshout state.
- First-timer: bubble = unread message; hover loses numbers; moon unexplained.
- Cross-repo orchestrator: repo link hover-only, no key.

## Minor
"last turn:" repeated; "ran 17"→"17 cmds"; branch slug cut mid-word at 30 chars (planPrompts.js) and duplicates plan title; moon on no-repo tab; nested hover in plan well.

## Questions
Sort by needs-you? Collapse idle rows to one line? A turn figure instead of a sentence?
