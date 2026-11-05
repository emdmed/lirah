# Plan lifecycle (idea → merged) and plan revision

Part A tracks the lifecycle. Part B covers revising a plan and re-chunking it (further down).

## Part A: lifecycle

## Context
You want to see each plan's whole life: idea → planned → building → done → PR → merged to main. Lirah already tracks most of this, but in separate places (task, plan, chunks), and it stops at "all chunks implemented". Nothing records a PR or the merge to main, and the plan has no stage you can see at a glance.

Most stages can be **derived from data that already exists**, so there's no new event log. Only two facts are new: the PR and the merge. Those are saved on the plan because branches get deleted after shipping.

## Stages and where each comes from
| Stage | When | Source (exists today?) |
|---|---|---|
| idea | task created | `task.createdAt` (yes; the task links to the plan by `task.planId`) |
| planned | plan imported | `plan.createdAt` (yes) |
| building | first chunk started | `min(chunk.startedAt)` (yes) |
| implemented | all chunks done | `planProgress` done == total, `max(chunk.doneAt)` (yes) |
| PR open | a PR exists for `plan/<slug>` | **new** `plan.pr {number, url, state, createdAt, mergedAt}` |
| merged | the plan's commits are on the base branch | **new** `plan.merged {at, sha}` |

## Changes

### 1. `src/features/plans/planModel.js`
- Add `PLAN_STAGE` (frozen enum, same style as `CHUNK_STATUS`): `planned, building, implemented, pr-open, merged`.
- Add `planStage(plan)`, a pure selector that returns the furthest stage reached (merged > pr-open > implemented > building > planned). It reuses `planProgress` and `planStarted`.
- Add `planLifecycle(plan, task)`, which returns `[{stage, at}]` for the timeline from the fields in the table above.

### 2. Merge detection: `src/features/plans/` (new `planLifecycle.js`, or next to `chunkCommits` in PlansContext)
- For each repo in `plan.git.repos`, against its `base` (falls back to `defaultBranch`): `git log <base> --grep "Plan-Chunk: <planId>/" --format=%H` through the existing `gitLines` (`src/lib/git.js`).
- The plan is merged when every implemented chunk's trailer is found on the base. This covers `--no-ff` merges, fast-forwards, rebases and GitHub squash merges, because the trailer text survives a squash.
- `merged.at` is taken from the first of these that exists:
  1. `pr.mergedAt`
  2. the date of the `Merge branch 'plan/<slug>'` commit on the base
  3. now
- `merged.sha` is that merge commit's sha, or the newest matching commit.
- When it runs:
  - once per plan when the plans pane loads, for plans that are implemented but not yet merged
  - on `commit-detected` where `branch` is main or master, the same trigger `useAutoChangelog.js:48` uses
  - Once `merged` is set, it is never checked again.
- Plans that commit straight to main without a plan branch show as "merged" as soon as they're implemented. That is correct.

### 3. PR stage: gh
- Add a Rust command `gh_pr_for_branch(repo_path, branch)` in `src-tauri/src/plans.rs`, registered in `lib.rs`. It runs the fixed command `gh pr list --head <branch> --state all --limit 1 --json number,url,state,createdAt,mergedAt` and returns stdout. It is a single command with fixed arguments, not a general shell runner.
- If `gh` is missing or not logged in, it returns `Err`. The frontend then skips the PR stage silently and logs one `console.warn`.
- Only plans with a branch (`plan.git.branch`) and a stage of implemented or pr-open are polled, at the same moments as the merge check, so there is no timer.
- It saves the result to `plan.pr` through the existing `updatePlan`.

### 4. Task closes itself
When a plan reaches `merged`, its linked task (found by `task.planId`, as in `useTaskPlanLinks.js`) moves to `done`. This is the gap the exploration found.

### 5. UI (small, in the existing look)
- `PlanRow`: a stage badge from `planStage`.
- `PlanDetail`: a short lifecycle strip from `planLifecycle`. Each stage is a dot with a date, and the gaps show how long each stage took. Add it inside the existing `Fig20Timeline.jsx` as one extra row rather than as a new figure.
- `PlanGitSection` / `Fig21PlanGit`: show "PR #N" (a link) next to "ready · alt m to merge", and show "merged <date>" once merged.

### 6. CLI
`lirah plans list/show` adds `stage` (and `pr` and `merged`) to the output it already prints (`useAgentControl.js:302-379`), so agents can see where a plan is.

## Part B: revising a plan's source, then re-chunking it

**Today:**
- `replaceSource` re-splits only plans that haven't started, and it throws away every chunk (`PlansContext.jsx:211`).
- If the file of a plan that has started changes, `usePlanFiles.importFile` makes a **new** plan (`usePlanFiles.js:66`).
- "re-split" only appears before any work starts (`PlanDetail.jsx:193`).
- The source is shown read-only in a `<pre>` (`PlanDetail.jsx:199`).

**The loop:** you ask for changes → Claude edits the plan file in a tab → you review it → you click re-chunk. The file on disk stays the source of truth, so all of this reuses the existing file watching.

### B1. Every plan has a file
If a plan has no `importedFrom.path` (it was pasted in `NewPlanDialog`), the first "revise" writes `plan.source` to `<repoRoot>/<slug>_plan.md` with `write_file_content` (the house rule) and sets `importedFrom {path, hash}`.

### B2. "revise" in PlanDetail (next to "source")
- A small textarea, "what should change?", with a send button. It goes to the active tab through `sendToTab`, the same path as `sendPlanFix`.
- New `buildPlanRevisePrompt(plan, notes)` in `planPrompts.js`, modeled on `buildPlanFixPrompt`, containing:
  - the file path
  - the progress so far (implemented and skipped chunk titles, and `decisionsBlock(plan)`)
  - your notes
  - the instruction to edit **only that file**, without implementing or committing anything, and to keep finished work as finished
- `sendPlanRevise` in PlansContext, next to `sendPlanFix`.
- Optional: an "edit" toggle that turns the `<pre>` into a textarea and saves to the file, for small changes by hand. It costs about 10 lines and goes through the same path.

### B3. Re-chunk that keeps finished work
- When the file's hash changes, `usePlanFiles` already marks it `changed`. In `FoundPlansSection` the label for that case becomes "updated · re-chunk". It no longer creates a new plan for a plan that has started.
- `replaceSource(repoRoot, planId, {source, importedFrom})`:
  - **Not started:** works as today and splits everything.
  - **Started:** keeps every chunk that is `implemented`, `skipped` or `in-progress` (an in-progress chunk blocks the re-chunk, and the button explains why). It then splits the remaining chunks again with `buildSplitPrompt(source, doneChunks)`. When `doneChunks` is passed, the prompt adds "these chunks are already done; return only the remaining work, and don't repeat them". The result is `chunks: [...kept, ...newChunks(result.chunks)]`, renumbered.
- `autopilot` is reset as today. `plan.git` is left alone (the branch and worktrees stay).
- The "re-split" button in PlanDetail calls `replaceSource` with the current file, so it also works after a plan has started.

### B4. CLI
`lirah plans revise <id> "<notes>"` and `lirah plans rechunk <id>`, wired like `plans.import` (`useAgentControl.js:318`). With these, an agent in a tab can run the loop as well.

### B5. Lifecycle tie-in
Every re-chunk appends `{at, hash}` to `plan.revisions`. Revisions show as ticks on the lifecycle strip from Part A.

## Skipped on purpose
- An append-only event log or stage history: every timestamp is derived or saved once.
- PR review/CI status and creating PRs from Lirah.
- Jobs: they have no branch or plan link, and adding one is a separate feature.
- Ideas with no task: a plan imported straight from a file starts at "planned".

## Verification
1. `npm test` (or the repo's runner), with unit tests for `planStage`/`planLifecycle` on fixture plans: none started, half done, all done, with a PR, merged.
2. In the app, on a test plan that uses worktrees:
   - Run its chunks. The badge goes building → implemented.
   - Push the branch and run `gh pr create`. "PR #N" appears on the next main commit or when the pane is reopened.
   - Merge with `git merge --no-ff plan/<slug>` on main. Within about 2 s (the commit watcher) the plan shows "merged" and the linked task moves to `done`.
3. Squash merge a plan on GitHub, then `git pull`. It is detected as merged by the trailer grep.
4. With `gh` logged out, everything except the PR stage still works.
5. `lirah plans show <id>` includes `stage`.
6. Revise loop:
   - Take a plan with 2 of 5 chunks implemented and send a revise note. Claude edits only the plan file.
   - The pane shows "updated · re-chunk".
   - After re-chunking, chunks 1–2 are unchanged (same commits) and 3+ are new. No duplicate plan is created.
   - Try it on a plan that was pasted in: a `<slug>_plan.md` file is created first.
7. Unit test: `buildSplitPrompt(source, doneChunks)` contains the done chunk titles, and the merge in `replaceSource` keeps the finished chunks.
