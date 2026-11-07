---
target: Lirah main window screenshot
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/src/components/Layout.jsx"
target_fingerprint: "sha256:0affe3b9d7f2fe487d5aabf611145d7e79be3b3a0ed92412f788a70c03b30aba"
target_path: /home/enrique/projects/nevo-terminal/src/components/Layout.jsx
timestamp: 2026-11-07T17-07-31Z
slug: src-components-layout-jsx
---
# Critique: Lirah main window (screenshot 36), 26/40

Heuristics: 1 Status 2 · 2 Match 2 · 3 Control 3 · 4 Consistency 2 · 5 Prevention 3 · 6 Recognition 3 · 7 Flexibility 4 · 8 Minimalist 3 · 9 Recovery 2 · 10 Help 2.

Specificity: clearly made for this product (chunk ruler, master fan, ghost chips with keycaps, italic names over mono notes). Weak spots: empty middle of the rail, plain Files tree.
Detector: 0 findings, but it ran without its HTML parser modules, so contrast and token checks were skipped.

## Priority issues
- [P1] Attention state disagrees across rail, rows and footer ("blocked" / "needs you" / "failed"; tab 1 lamp off while card says needs you). clarify
- [P1] The interrupted plan reads 21/21 with every dot filled, so it looks finished. harden
- [P2] Gold is overspent: the selected "terminal" segment is gold (should be ink), plus the focus frame, "needs you" and the caret. quieter
- [P2] The Workspace header stack takes about 140px and is cryptic ("TERMINAL ○○○○○○ → 0/6 open", a double "+ +"). distill
- [P3] The rail's middle is dead and the CTX meter is hard to read (no % or zone). layout

## Minor
Faint counts in the Files legend, a clipped glyph before "+3" on Alkor, prism shows a red reticle but "clean", the Context legend repeats itself, the "instructions"/"saved sets" toggles float away from what they change, no dot marks a waiting workspace.
