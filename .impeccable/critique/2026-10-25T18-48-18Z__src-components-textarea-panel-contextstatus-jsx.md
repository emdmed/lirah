---
target: context pane buttons too small
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/enrique/projects/nevo-terminal/src/components/textarea-panel/ContextStatus.jsx"
target_fingerprint: "sha256:b093e9c26d67ecfe5e5219e01fd71746a3936890c669c5af34ab27b86efb6df9"
target_path: /home/enrique/projects/nevo-terminal/src/components/textarea-panel/ContextStatus.jsx
timestamp: 2026-10-25T18-48-18Z
slug: src-components-textarea-panel-contextstatus-jsx
---
# Critique: [3] CONTEXT pane, control sizing (ContextStatus.jsx)

Score 24/40. Heuristics: 1=3, 2=3, 3=3, 4=1, 5=2, 6=3, 7=2, 8=3, 9=2, 10=2. Detector: clean (0 findings, no target-size rule).

Design specificity: authored Lirah (legend lamp, cost in border, one-line file summary), but under-scaled, and the controls come in two different styles.

## Priority issues
1. [P1] Interactive controls are 16px / 10px, below the app's 20-24px / 11px floor (status bar h-5, file rows h-6, Button xs h-6, --text-xs 11px). The body row is already 24px tall because of the instructions/project buttons, so growing them costs 0 terminal rows. Fix: ModeSegment.jsx:7 SEGMENT -> h-6 px-1.5 text-[11px]; ModeClear h-6 w-6; ModeSep 11px; passive lines to 11px. (layout)
2. [P1] Chip tag (cycle) and × are adjoining 16px targets, so a misclick cycles or removes. Fix: ContextChips CHIP h-5 text-[11px], tag h-5 px-1.5, REMOVE h-5 w-5 text-[13px] with lamp focus outline; max-h-[68px]. (layout, harden)
3. [P1] peek · prompt box sit in the 14px legend strip on the hairline and can never be good targets. Fix: move them into the body's right cluster: peek · prompt box ✦ instructions ▾ project ▾, all h-6/11px. (layout)
4. [P2] instructions is tinted (data-lit) while project is not; the chevron is on project only; the menus use different align values. Fix: drop the tint (the template already shows as a chip), add a chevron to instructions, align both to end, rename project -> sets. (polish, clarify)
5. [P3] No keys for peek/prompt box/sets; Alt+Alt appears only in a title; each chip adds 2 tab stops. (harden)

## Persona red flags
- Alex: controls sit ~1500px from the chips (ml-auto); tag/× misfires; mouse needed for peek.
- Sam: 10px text, 16px targets (WCAG 2.5.8), faint ring-1 focus on ×.

## Minor
Single-child gap-0.5 wrappers (PromptToolbar/ProjectToolbar); min-h-4 on a 24px row; the file summary looks like a button but is a span; no undo for chip removal.
