---
target: planning mode
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/home/enrique/projects/nevo-terminal/src/features/planning/PlanningPanel.jsx"
target_fingerprint: "sha256:a4765beba0532adcfab3c2341c10486874851020dc8b92794c45140623a7e833"
target_path: /home/enrique/projects/nevo-terminal/src/features/planning/PlanningPanel.jsx
timestamp: 2026-11-12T18-03-19Z
slug: src-features-planning-planningpanel-jsx
---
# Planning mode critique: 26/40 (verdict: partly the right UI)
Heuristics: 1:2 2:2 3:3 4:3 5:2 6:3 7:3 8:3 9:3 10:2. Detector: 0 findings.
Split-tab IA is right (agent terminal left, draft files + gates right). The middle is wrong: 4 fixed draft buttons make planning a form; lirah_skill.md:179 tells the agent "only the parts the work has".
P1 Mockup defaults on (planningModeStore.js:99) -> plan without ui.md can't approve draft until `m`. Fix: gate only when ui.md exists.
P1 Fixed parts read as a checklist ("1 of 4"). Fix: "N written", dim unsent parts as optional, "+ part" row.
P1 No gold "your turn" when agent waits on a sent part (PlanningPanel.jsx:517,307). Fix: waiting -> lamp body + note.
P1 Chunks go stale after revise/redraft silently. Fix: compare source hash to importedFrom.hash, flag "draft changed · r", make re-chunk primary.
P2 "approve draft" actually splits; two approvals. Fix: rename "split into chunks"; add key to focus revise box.
Fixed since 17:09 run: secondary terminal kept mounted, agent-missing guard, undoable cancel, keyboard nav + hints.
