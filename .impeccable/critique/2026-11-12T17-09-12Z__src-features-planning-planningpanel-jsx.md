---
target: planning mode
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/enrique/projects/nevo-terminal/src/features/planning/PlanningPanel.jsx"
target_fingerprint: "sha256:e1e56f577e998ed40551ccfc0b267ed5f5d706486742c8dc13ab4ab7e6688944"
target_path: /home/enrique/projects/nevo-terminal/src/features/planning/PlanningPanel.jsx
timestamp: 2026-11-12T17-09-12Z
slug: src-features-planning-planningpanel-jsx
---
# Planning mode critique — 20/40
Heuristics: 1:2 2:3 3:1 4:2 5:1 6:3 7:1 8:3 9:2 10:2. Detector: 0 findings.
P0 Entering planning mode unmounts SecondaryTerminal -> close_terminal (useTerminal.js:478). Fix: keep mounted, display:none.
P1 draft/revise send prompts blindly into the tab terminal; with no agent they run as bash. Fix: reuse the agent-missing/busy guard.
P1 cancel plan: one click, no confirm/undo, draft vanishes. Fix: undo toast or HoldButton.
P1 No keyboard inside the panel; Alt+4 targets hidden pane; Alt+P doesn't move focus. Fix: data-pane, focus on open, j/k + d/a/r, FrameHints.
P2 Draft stage one-way and cluttered: picker stays, files+parts duplicated, parts gone after approve draft, title-only draft approvable.
Also: drafts list is global across repos; StepOrbit gold sun while nothing runs; ins-glass on non-terminal surface; sidebars hidden lose waiting lamps.
