---
target: workspace pane (right sidebar)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/home/enrique/projects/nevo-terminal/src/features/agent-jobs/RightSidebar.jsx"
target_fingerprint: "sha256:b31529035b3c2a78ddbe47b586ed0869726f04c5253b1dc4c5a839b821710a88"
target_path: /home/enrique/projects/nevo-terminal/src/features/agent-jobs/RightSidebar.jsx
timestamp: 2026-11-07T10-32-55Z
slug: src-features-agent-jobs-rightsidebar-jsx
---
# Workspace pane (right sidebar): critique
Method: dual-agent (A: design review · B: detector). Score 24/40. Nielsen: status 3, match 2, control 3, consistency 2, prevention 3, recognition 2, flexibility 3, minimal 2, recovery 3, help 2.
Detector: 0 findings (tabs, plans, agent-jobs). Contrast passes in Rivendell.
## Priority issues (proposal cards 01–10)
- [P1] No keyboard section switch; `:jobs` folds the pane (RightSidebar.jsx:146). Fix: [ ] cycle, tablist, :jobs/:tabs.
- [P1] Legend + switch row overflow at 256px (workspaces, +, AGENTS clipped). Fix: current workspace ▾ + "+N" chip menu.
- [P1] Active row name squeezed by always-on actions (TabRow.jsx:284). Fix: actions move to branch line.
- [P1] Tally double-counts permission (OWN_BUSY ∩ YOUR_TURN); footer words differ from rows; 3 colours for waiting.
- [P2] Jobs waiting for review uncounted; Review/Apply hidden until expand; no repo on card; toast uses active tab branch.
- [P2] Footer key hints flood (10 keys) and hide tally; no glyph legend.
- [P2] Three selector styles; gold used for "chosen" (rule 11).
- [P2] Section scopes differ silently. Fix: scope captions.
- [P2] Four "new" patterns, four empty states.
- [P3] a11y: muted/75 branch contrast, nested role=button, waiting dot no role, resize not keyboard reachable.
