---
target: zen mode
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/enrique/projects/nevo-terminal/src/features/zen"
timestamp: 2026-11-09T23-40-10Z
slug: src-features-zen
---
# Zen mode critique — 26/40 (Acceptable)
Heuristics: 1 Status 3 · 2 Real world 3 · 3 Control 3 · 4 Consistency 1 · 5 Error prevention 3 · 6 Recognition 2 · 7 Efficiency 4 · 8 Minimalist 3 · 9 Recovery 2 · 10 Help 2.
Detector: clean (src/features/zen, TabBar.jsx).
## Priority issues
- P1 Three numbering systems: legend hard-coded `index={2}` (Terminal.jsx:84); strip digit = tab index+1 (ZenStrip.jsx:90); line digit = column. Fix: one number per column, matching Ctrl+Alt+1–3.
- P1 No right gutter: Layout.jsx:63 pads only left (pl-3); right gutter came from RightSidebar mr-3, hidden in Zen. Fix: pr-3 in Zen.
- P1 Idle gold: focused strip digit and line digit gold (ZenStrip.jsx:90, ZenLine.jsx:102); refusal notice gold (ZenLine.jsx:169). Fix: ink; notice ink/fault.
- P2 Double focus frame: inline full-ink outline (ProjectTab.jsx:189) on top of .terminal-live::after. Fix: use --ins-edge-focus or drop.
- P2 Legend vs strip name mismatch (dir basename vs display name; legend title says "Terminal").
## Minor
Alt+6/7 with no plan/CLI open invisible or misplaced drawers; drawer keys only in tooltips; "today 0" lacks unit; line segments all shrink-0 (overflow); fold caret lacks aria-label; DESIGN.md says strip is above the terminal, it's below.
