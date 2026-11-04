---
target: send-as-prompt + claude start command
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/src/features/plans/NewPlanDialog.jsx"
target_fingerprint: "sha256:34d8be3cafc8f0d1a71bb9935fe8ad03ac2c284f152afa6f8aeea8a03bbcbf01"
target_path: /home/enrique/projects/nevo-terminal/src/features/plans/NewPlanDialog.jsx
timestamp: 2026-11-04T11-51-12Z
slug: src-features-plans-newplandialog-jsx
---
# Critique: Send as prompt (NewPlanDialog) + Claude start command (Settings)
Score 25/40. Detector: 0 findings.
P0 Send pastes + Enter into whatever runs in the tab; a bare shell executes the markdown lines. Gate on agent state, else disable with reason.
P1 No in-flight state; double click sends twice. Add sending flag, disable both keys.
P1 No keyboard path; Enter runs Split. Bind Ctrl+Enter to send, show in frame hints.
P2 Start command field is a black box: no readout of detected command, no test. Show "now: …" readout.
P3 Title "New plan" now partly wrong; error copy differs from sibling path.
