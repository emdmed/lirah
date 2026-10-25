---
target: context status pane
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/src/components/textarea-panel/ContextStatus.jsx"
target_fingerprint: "sha256:0b09831bc770149aebb8e8e41a5a51657f6ac9b70fb58f9f2ebb7716dad93828"
target_path: /home/enrique/projects/nevo-terminal/src/components/textarea-panel/ContextStatus.jsx
timestamp: 2026-10-25T18-32-31Z
slug: src-components-textarea-panel-contextstatus-jsx
---
# Critique: [3] CONTEXT pane (ContextStatus.jsx)

Score 24/40 (Acceptable). Heuristics: 1=3, 2=3, 3=3, 4=2, 5=2, 6=3, 7=2, 8=2, 9=2, 10=2.

Design specificity: partly authored. Legend status lamp, border cost, peek are Lirah. The body is a generic tag cloud duplicating the files pane.

## Priority issues
1. [P1] Duplicates the sidebar file list; costs 3+ terminal rows. Fix: one summary line ("14 files: 12 edit · 2 read") when the files pane is open; chips only for elements/repos/template/patterns; full chips only when the files pane is closed. (distill, layout)
2. [P1] "attached" legend and "nothing attached" body show together after the hook fires (selection resets during justAttached). Fix: snapshot the sent manifest, show it dimmed as a settled line; aria-live status. (harden)
3. [P2] 14 gold EDIT tags drown out the live status. Fix: group by intent, default tag in ink, colour only exceptions, show the click-to-cycle cue. (quieter)
4. [P2] Controls scattered and mixed scope: compaction (per tab) in a per-prompt manifest; "project" mislabels sets; insert last and unframed. Fix: rename to sets, move compaction to status bar, instructions+sets into legend, insert as framed primary first. (layout, clarify)
5. [P3] Keyboard/SR: [1] hint should be Alt+1; 28 tab stops; no shortcuts for peek/insert/prompt box; label-in-name mismatch on peek/insert; aria-pressed+aria-expanded both on peek; 16px targets. (harden)

## Persona red flags
- Alex: sees files twice, can't collapse, mouses to insert, loses terminal rows.
- Sam: 28+ tab stops, silent status changes, wrong key hint, 16px targets.
- Riley (multi-tab): repo chips lost after file chips; per-tab compaction in per-prompt list; status doesn't say whether an agent is running.

## Minor
Double gold on pending status; nested scroll with no hint; latent wrong empty copy in ContextChips; mixed separators; MODE_TOKENS alpha backgrounds (FileStateSelector.jsx:9-11).

## Questions
Fold [3] into the terminal's bottom border when the files pane is open? Say "every prompt" when keep is on? "waiting for an agent" when none is running?
