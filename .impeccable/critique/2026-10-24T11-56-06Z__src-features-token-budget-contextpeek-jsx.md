---
target: context meter dropdown (ContextPeek)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/src/features/token-budget/ContextPeek.jsx"
target_fingerprint: "sha256:134f96f9871ff2b33582e95a2085e926f695859ac6d518520aa214eba5117e28"
target_path: /home/enrique/projects/nevo-terminal/src/features/token-budget/ContextPeek.jsx
timestamp: 2026-10-24T11-56-06Z
slug: src-features-token-budget-contextpeek-jsx
---
# Critique: context-meter dropdown (ContextPeek)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Loading/empty/error covered; header % doesn't take the trigger's warn/fault tone |
| 2 | Match System / Real World | 3 | "Reminders & hooks", "Tool definition Artifact" run kind and name together |
| 3 | User Control and Freedom | 2 | Shows the problem, offers no lever (compact/clear), rows not clickable |
| 4 | Consistency and Standards | 2 | Header % of window vs row % of used; round dots break square rule; 10px legends |
| 5 | Error Prevention | 3 | Read-only; red/brightRed group hues read as fault |
| 6 | Recognition Rather Than Recall | 2 | Colour-matching bar↔list; bar order ≠ list order |
| 7 | Flexibility and Efficiency | 2 | No shortcut for Details…; no jump from a Largest row to the item |
| 8 | Aesthetic and Minimalist Design | 3 | Dense and tidy; double colour coding is noise |
| 9 | Error Recovery | 2 | "couldn't read the session" with no reason or retry |
| 10 | Help and Documentation | 2 | Group hints exist in contextGroups.js but are never shown |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict
~60% authored. Lirah's voice is in the #-comment empty states, Scanner, tabular mono figures and legend header. The data graphic is generic SaaS: round dots + full-width rainbow bar, no Meter, no ceiling, no star. Detector: 0 findings in ContextPeek.jsx and StatusBar.jsx (static rules only; no rendered checks possible).

## Priority Issues
- [P1] Bar has no ceiling: stacked bar spans 100% of *used*, header talks about the 1.0M window. Fix: draw on window scale with --ins-well track, warn/fault zones; tone the header %.
- [P1] Colour is the only link between legend and bar; rounded-full dots; bar order ≠ list order; red/brightRed/yellow groups collide with fault/warn. Fix: square swatches, sorted bar, non-status hues, hints as titles.
- [P2] No action: add [compact]/[clear] when heavy; Largest rows open Details at that item.
- [P2] Two % bases + muddy labels (kind+name run together, /home/... paths not collapsed to ~).
- [P3] 10px legends on an 11px pixel face.

## Persona Red Flags
- Alex: no shortcut for Details…, no keyboard route from a Largest row; tooltip hint says "click".
- Sam: bar is aria-hidden colour-only; groups read as an unlabelled grid; muted % on a blurred veil untested for contrast.
- Multi-agent dev: no tab/session named; wants one line: "this tab, 12%, mostly tool results — compact?"

## Minor Observations
key={i} on items; Details… has no keycap; Largest rows repeat the group dot; w-12 column clips past 999.9K; groups beyond top 5 silently dropped (no "+N more").

## Questions to Consider
- Why doesn't the product's one sanctioned gauge (Meter) appear in the main view of the context window?
- Should the panel end in a verdict ("tool results dominate · compact frees ~30K") instead of a table?
- Is an 11-hue rainbow a nugget, or a redesign creeping in through the data viz?
