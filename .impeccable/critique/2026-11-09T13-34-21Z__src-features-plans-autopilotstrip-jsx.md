---
target: plan detail + auto-pilot strip
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/src/features/plans/AutopilotStrip.jsx"
target_fingerprint: "sha256:4bc3be6f6fec414699d77c5a77ef84c98b51aa777ab31568b24d1fcec0479bb3"
target_path: /home/enrique/projects/nevo-terminal/src/features/plans/AutopilotStrip.jsx
timestamp: 2026-11-09T13-34-21Z
slug: src-features-plans-autopilotstrip-jsx
---
# Critique: plan detail + auto-pilot strip — 21/40 (Acceptable)
Method: dual-agent. Detector: 0 findings (8 files). No browser overlay (Tauri window).

Heuristics: 1 Status 1 · 2 Real world 2 · 3 Control 3 · 4 Consistency 2 · 5 Error prevention 2 · 6 Recognition 2 · 7 Flexibility 2 · 8 Minimalism 2 · 9 Recovery 2 · 10 Help 3.

## Priority issues
- [P0] Paused-after-app-close shows "chunk 3 of 12 · 9 left" / 3/12 while git has chunks 1–11 committed; resume silently adopts 4–11. Fix: read chunkCommits on load (read-only) and say "11 of 12 committed", message names chunks 4–11, resume key says "adopt 8" (or adopt on load). /impeccable clarify
- [P1] Loop plate paints a benign APP_RESTARTED pause as red fault at NEXT, and station numeral chips (loopPlate.js:61) read as chunk numbers ("NEXT 4"). Fix: 'wait' chip state for PAUSED, red only for FAILED; name stations or use letters. /impeccable colorize, polish
- [P1] stop's Square icon (AutopilotStrip.jsx:114) reads as an unchecked checkbox beside "fresh context". Fix: drop icon, hairline gap; restore the /clear hint while paused (PlanDetail.jsx:179). /impeccable polish
- [P2] Progress repeated 5 ways; FIG.20 + FIG.21 push chunk list below the fold. Fix: showCount={false} and no slowest callout while live; FIG.21 to its one-line fallback during a run. /impeccable distill
- [P2] "Open the plan and resume it." shown inside the open plan (planModel.js:223). Fix: pane copy separate from notification copy. /impeccable clarify

## Persona red flags
- Power user: no key hints on strip; station grammar learned from tooltips.
- First-timer: red NEXT 4 = "chunk 4 failed"; stop vs pause unclear; fresh context unexplained.
- Overnight orchestrator: sees pre-close snapshot; truthful commit line truncated.

## Minor
- Commit line truncates the chunk title; prefer "chunk 11 · DESIGN.md update".
- FIG.21 merge verdict uses lamp gold for non-live state.
- Lifecycle line spends a row on a 1-minute gap.

## Questions
- Should the loop plate draw at all while paused after a restart?
- Is the station loop a user view or a debug inset?
- Should app-close be a pause at all when commits can be verified on load?
