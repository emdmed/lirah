---
target: app shell hierarchy, font size, color
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/enrique/projects/nevo-terminal/src/components/Layout.jsx"
target_fingerprint: "sha256:0affe3b9d7f2fe487d5aabf611145d7e79be3b3a0ed92412f788a70c03b30aba"
target_path: /home/enrique/projects/nevo-terminal/src/components/Layout.jsx
timestamp: 2026-11-07T16-49-02Z
slug: src-components-layout-jsx
---
# Critique: Lirah app shell (hierarchy, font size, colour)
Score 27/40. Detector: 0 findings.

## Priority issues
- [P1] Opacity/faint-dimmed informational text at 2.5–3.1:1 (FileNode.jsx:43, FileTree.jsx:331, PlanDetail.jsx:458,470, FIG captions). Fix: text-muted-foreground, no opacity; contrast check should flag opacity-* on text.
- [P1] Spectral italic 11px verbs (button.jsx:16-23) — instructions, saved sets, go to tab, resume. Fix: 13px like index.css:1201 or mono.
- [P1] Same state in two colours (blocked gold vs rose; PlanDetail.jsx:271), gold on finished counts (21/21, 0/6, plan branch). Fix: blocked=fault, waiting=gold, done=ink.
- [P2] Off-scale display sizes 15/16/17/18 (TabRow:242, ChunkRow:303, index.css:479, ProjectTab:124); 10px at TabRow:219, TokenLineChart:71,77,85. Fix: names 13/16; floor 11.
- [P2] PlanDetail: FIG.09 outranks the halt instruction; 5 chrome rows. Fix: action first, figure after/compact.
