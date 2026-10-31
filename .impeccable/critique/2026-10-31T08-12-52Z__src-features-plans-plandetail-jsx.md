---
target: Plans detail panel
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/enrique/projects/nevo-terminal/src/features/plans/PlanDetail.jsx"
target_fingerprint: "sha256:28eb01d7d9187fa71fb4256545ccb1f2337c4e181a2639ec2c9e446ba1c9cbb2"
target_path: /home/enrique/projects/nevo-terminal/src/features/plans/PlanDetail.jsx
timestamp: 2026-10-31T08-12-52Z
slug: src-features-plans-plandetail-jsx
---
# Critique: Plans detail panel (PlanDetail.jsx + figures + ChunkRow)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | FIG.20 plots only implemented chunks; stuck chunk 8 and 12 todo chunks invisible beyond "7/20" |
| 2 | Match System / Real World | 3 | "chunks · 33m 31s" leaks internal kind name |
| 3 | User Control and Freedom | 3 | reset's "changes are kept" only in tooltip |
| 4 | Consistency and Standards | 3 | 10px Departure Mono legends (ChunkRow 140,155,404; AutopilotStrip 79); note order ≠ button order |
| 5 | Error Prevention | 2 | commit = blind git add -A; auto-pilot key stays primary while a chunk is stuck |
| 6 | Recognition Rather Than Recall | 2 | stuck state asks commit vs mark done without showing tree dirtiness |
| 7 | Flexibility and Efficiency | 3 | no keys for check/commit/reset/mark done |
| 8 | Aesthetic and Minimalist Design | 3 | slowest callout boxed; duration twice; auto-pilot split in two blocks |
| 9 | Error Recovery | 3 | no-commit note honest but no diagnosis or recommendation |
| 10 | Help and Documentation | 2 | explanations live in title= tooltips only |
| **Total** | | **27/40** | Good |

## Priority Issues
1. [P1] Stuck "no commit" chunk has no diagnosis and no recommended action — show dirty/clean, make matching action primary, move note+actions under title. (clarify, harden)
2. [P1] Hierarchy points away from the problem — lamp-framed "run on auto-pilot" is the loudest thing while chunk 8 is stuck; status sits below action; stuck chunk at the bottom. (layout)
3. [P2] FIG.20 is purely retrospective; its only box goes to "slowest" trivia while live state has none. Draw stuck node + dashed todo tail; unbox callout. (quieter, clarify)
4. [P2] Token/rule drift: 10px legends, glowing ok lamp on settled chunks, note/button order mismatch. (polish)
5. [P3] No keyboard parity for stuck-chunk interventions. (harden)

## Minor
- Branch label clipped mid-word with no ellipsis/title; Fig21 maxChars uses leftW+10 vs drawn at leftW+18.
- Chunk title semibold competes with plan title.
- Trash is the only icon key in a text-key header.
- "dismiss" with check icon next to "off" is unclear.
