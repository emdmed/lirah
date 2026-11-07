---
target: workspace sidebar tabs list
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/src/features/tabs/TabsSummaryPane.jsx"
target_fingerprint: "sha256:d5da7f5fa6d0cdae6c696e2d4740d0ffb30076c32b72fc86273a38c7773c55c5"
target_path: /home/enrique/projects/nevo-terminal/src/features/tabs/TabsSummaryPane.jsx
timestamp: 2026-11-07T10-15-42Z
slug: src-features-tabs-tabssummarypane-jsx
---
# Workspace tabs list: critique
Score 24/40 (Acceptable). Nielsen: status 2, match 2, control 3, consistency 2, prevention 3, recognition 2, flexibility 4, minimal 2, recovery 1, help 3.
## Priority issues
- [P1] Failed run: fault lamp beside warn-coloured "error" tag (TabPlanTier, PlanRow). FIXED.
- [P1] Failure reason clipped to one line, no chunk named. FIXED (chunk N · message, 2 lines).
- [P2] FIG.16 repeats the count three times (CHUNKS legend, "3 done", 3/8). FIXED.
- [P2] Figure doesn't mark the failed chunk. FIXED (fault node).
- [P2] Footer "6 resting" ignores failures; chosen workspace in gold breaks rule 11. FIXED.
## Open
- Nested role=button inside the row (a11y); hover-only row actions; `e` key not in hints; master row density; header crowding.
