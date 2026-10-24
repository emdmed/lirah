---
target: rivendell color theme
total_score: 13
max_score: 20
na_heuristics: 2,3,5,7,10
p0_count: 0
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/src/themes/theme-config.js"
target_fingerprint: "sha256:5ca75723de381971ebc494ad8cf85d2a8d4e3f1dad431a67a7100743b222b217"
target_path: /home/enrique/projects/nevo-terminal/src/themes/theme-config.js
timestamp: 2026-10-24T15-34-58Z
slug: src-themes-theme-config-js
---
# Critique: Rivendell color theme (src/themes/theme-config.js)

Score 13/20 (heuristics 2,3,5,7,10 n/a for a color theme).

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | lamp #dcb662 vs warn #e4b56e ΔE 7.0, ΔL* 0.7 |
| 4 | Consistency | 2 | one gold on lamp, accent, ring, sidebarRing, folder, cursor, ANSI yellow |
| 6 | Recognition | 3 | git +/- tied to ANSI green/red |
| 8 | Aesthetic | 3 | coherent, too much gold |
| 9 | Error Recovery | 3 | fault drops clearly in L* |

Specificity: partly authored; structurally Everforest-darker; shares role map with lothlorien. Detector: 0 findings (not meaningful on JS config).

## Priority issues
- [P1] lamp == warn. Fix: warn #e5925f, optional fault #d9604f. ($impeccable colorize)
- [P1] gold spent on non-live tokens; current-path row uses solid bg-accent (FileNode.jsx:57, FolderNode.jsx:26, FlatViewMenu.jsx:51,65). Fix: folder 38 32% 60%, accent hsl(286 22% 70%), row -> bg-accent/15 or .ins-row-selected. ($impeccable colorize, polish)
- [P2] blue/magenta merge under deuteranopia (ΔE 2.3); blue/cyan, green/cyan 14.7. Fix: blue #73a3cc, magenta #c897b8, brightBlue #94bedb, brightMagenta #dab1cc. ($impeccable colorize)
- [P2] brightBlack #56625f 2.74:1 (1.79 on selection). Fix: #6b7874, selection #34453f. ($impeccable polish)
- [P2] terminal bg ≈ gutter (ΔE 0.5); bg/card ΔE 2.0; border 1.44:1. Fix: terminal bg #182125 or recessed #0f1518. ($impeccable layout)

## Persona red flags
Alex: misses warnings; busy gold tree. Sam: on/warn identical; blue/magenta merge; comments 2.7:1. nvim dev: comments vanish under Visual.

## Minor
normal/bright pairs ΔE 4.9-9.3 (normal); destructive vs fault near-duplicates; mutedForeground third neutral hue; celadon least Rivendell.

## Questions
Rivendell vs Lothlórien differentiation; silver-white Eärendil lamp; why folders are second-loudest color.
