---
target: workspace pane proposals
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/workspace-pane-proposals.html"
target_fingerprint: "sha256:6a77085a9fcd1d91b04cf926362f63693094ba36091e4ea69e1c1e842587a577"
target_path: /home/enrique/projects/nevo-terminal/workspace-pane-proposals.html
timestamp: 2026-11-07T10-47-45Z
slug: workspace-pane-proposals-html
---
# Workspace pane proposals: critique
Method: dual-agent (A: design review · B: detector + headless render). Projected sidebar score with kept/reworked proposals ≈31/40 (today 24); as written ≈28.
Verdicts: 01 keep (ship :jobs one-liner first; AltGr risk on [ ]), 02 rework (wrong premise: "2 running" = background jobs; show all workspaces while they fit, +N only on overflow), 03 rework (link never on active row; simplest fix drop `|| active` at TabRow.jsx:284), 04 keep (map hookless `waiting` consistently), 05 rework count (single number), keep repo + toast fix, 06 rework (`?` opens Ctrl+H section; glyph key missing waiting/remote/running/failed), 07 keep, 08 keep (exposes tasks-scope copy bug shortcuts.js:48), 09 keep low, 10 keep.
Missed: no waiting signal outside tabs section; legend status word ambiguous; tasks scope copy; waiting mapped 3 ways; workspace rename has no command.
Detector: 3 findings, all kit-level false positives/minor (ran degraded, regex mode). Mock defects: [open] clipped in master strip, job sub-line clipped without ellipsis, empty space under workspace-menu mock.
