---
target: context pane
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/enrique/projects/nevo-terminal/src/components/textarea-panel/ContextStatus.jsx"
target_fingerprint: "sha256:b82c45450a999c4b3e46498767049dd38b7dd8a18c430b434c6c63a7ee316e52"
target_path: /home/enrique/projects/nevo-terminal/src/components/textarea-panel/ContextStatus.jsx
timestamp: 2026-10-27T14-50-19Z
slug: src-components-textarea-panel-contextstatus-jsx
---
# Context pane critique — 26/40 (Acceptable)

Heuristics: 1:3 2:3 3:3 4:2 5:3 6:2 7:2 8:3 9:2 10:3. Detector: 0 findings (6 files, incl. --scope layout).

Specificity: manifest half is authored (labelled rows, intent tally, per-state legend, keycap empty state); control row is a stock justify-between footer with stranded `peek`.

Priority issues:
1. [P1] FILES row is a count, not the files; tally pills look clickable but aren't; READ uses destructive red. Fix: names as chips by default, fold past ~8; plain-text tally with tinted labels. (clarify, colorize)
2. [P1] Control row flung apart; `peek` ~950px from what it relates to. Fix: one left-aligned bank with ins-sep-star, or peek into PaneInfo beside token estimate. (layout)
3. [P1] No keys for insert/peek/keep; double-Alt only in tooltip. Fix: focused-pane FrameHints `i insert · p peek · k keep`, register in `:` palette. (harden)
4. [P2] Peek <pre> grows pane up to 192px and resizes terminal; nested scrollers (section + ContextChips ul); legend status collides at narrow widths. Fix: peek as FloatPane, single scroller, truncate legend status. (harden, adapt)
5. [P2] Label-in-name failures: "saved sets" aria "Project actions…", "peek" aria "Read the text…". (clarify)

Personas: Alex — no keys, can't verify names. Sam — tally read as loose text, many chip × tab stops. Multi-agent dev — repo chip lacks source tab number/moon/busy state.

Minor: 7rem label column too wide; legend lamp lit at rest; attached line hides kept context; max-h 112 vs 104 math.
