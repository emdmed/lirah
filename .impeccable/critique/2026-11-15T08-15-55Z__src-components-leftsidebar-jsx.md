---
target: tabs dropdown + files default
total_score: 20
max_score: 36
na_heuristics: 9
p0_count: 1
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/src/components/LeftSidebar.jsx"
target_fingerprint: "sha256:61513b90495442c4201a556f8b78d7c465df3c08239d1882d9845fc7b425f512"
target_path: /home/enrique/projects/nevo-terminal/src/components/LeftSidebar.jsx
timestamp: 2026-11-15T08-15-55Z
slug: src-components-leftsidebar-jsx
---
# Critique: tabs dropdown + files default (LeftSidebar)
Score (proposed dropdown): 20/36 (h9 n/a); current ~27.
Verdict: make files the default, don't use a dropdown; keep a one-line lamp strip (one lamp per tab, gold when waiting, master 0/7) that unfolds the full tab list in place.
- P0 Waiting agents disappear while the dropdown is closed. Fix: lamp strip, like the zen bottom line.
- P1 A closing menu can't hold row actions (worktree, plan, branch copy, fold). Fix: unfold in place.
- P1 New kind of control; reuse the fold/unfold pattern instead.
- P2 :tabs / showFiles toggle sidebarSection; map :tabs to fold/unfold the strip.
- P3 Master progress ruler lost; fold into summary line.
Detector: clean (0 findings, 5 files). No browser overlay (desktop app).
