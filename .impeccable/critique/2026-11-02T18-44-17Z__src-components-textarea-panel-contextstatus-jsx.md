---
target: context empty state + hidden rule
total_score: 24
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/src/components/textarea-panel/ContextStatus.jsx"
target_fingerprint: "sha256:d16371fb79cfff2d4381caed65ee388f05afa6490dae61aaed1ee54e03dac4da"
target_path: /home/enrique/projects/nevo-terminal/src/components/textarea-panel/ContextStatus.jsx
timestamp: 2026-11-02T18-44-17Z
slug: src-components-textarea-panel-contextstatus-jsx
---
# Critique: Context pane empty state (ghost chips) + hidden-folders rule — commit 4d69219
Method: dual-agent. Score 24/36 (H9 n/a). Detector: 0 findings.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | "nothing attached" drops what it means (prompts go as typed) |
| 2 | Match real world | 2 | "link a tab's repo" sits under the FILES label |
| 3 | User control | 3 | ghosts only move focus; harmless |
| 4 | Consistency | 2 | focus is dash→solid with outline-none; real chips use ring-1 ring-ring |
| 5 | Error prevention | 2 | repo ghost shows with only one tab |
| 6 | Recognition | 3 | keycaps teach alt 1 / alt 4 in place |
| 7 | Flexibility | 2 | no pane keys in the empty state; hint line blank |
| 8 | Minimalist | 4 | one row, same height as filled |
| 9 | Error recovery | n/a | no error path |
| 10 | Help | 3 | tooltips + DESIGN rule 13 |

Priority issues
- [P1] Focus state too weak and off-system (ContextStatus.jsx ghost className): use focus-visible:ring-1 ring-ring like chips.
- [P1] Ghost goes solid on hover/focus, so it looks like a real chip: keep the dash, brighten the dash colour and the +; update rule 13.
- [P2] Repo ghost under FILES: two rows FILES / REPOS (48px = the floor, so no height change), or one neutral "add" row.
- [P2] Status lost its meaning: "nothing attached · prompts go as typed".
- [P3] Hidden rule 38px is off-grid and centred: 36px, weighted toward the group below (more air above than below); pinned separator at 9px is now the weaker break.

Minor: stale "three ways" comment (ContextStatus.jsx:28); orphaned .ins-blank comment in index.css; dashed edge-strong at 1px may be under 3:1; sr text "Context nothing attached"; gap-1.5 vs chips' gap-1.
