# Writing QA recipes

For the model that writes recipes (Opus, run with `/qa-recipes`). Recipes are run later by a cheap model (Haiku) that knows nothing about the code. It only gets `qa/AGENT.md` and the recipe, and drives a freshly reset app through `lirah qa ...`. A recipe is good when Haiku passes it on a good build and fails it when the feature breaks.

## Which features

The argument names features from the table in `qa/index.md`:
- `<feature> [<feature>...]`: those features, writing new recipes or rewriting existing ones.
- `missing`: every row without a recipe, in table order.
- `all`: rewrite every recipe (only when the UI changed a lot).

Do the features one at a time, and update the index after each one, so stopping halfway leaves finished work behind.

## Per feature

1. **Learn what the feature promises.** Read its spec in `docs/specs/` if there is one (Behavior, Acceptance Criteria) and skim its code in `src/features/`. List the 2–4 things a user would be most upset to see break. Those are what the recipe checks. Skip anything you can't check from the screen or a terminal.
2. **Walk it in the real app.** Run `npm run qa -- --up` once, with the sandbox disabled because it opens a window. It attaches to the shared instance or starts it, prints the path of its `lirah` wrapper and exits. Call that path directly, with no exports or unsets, and check `<wrapper> qa whoami` shows `qa: true` before driving. Never start a second instance. Do the journey yourself with `<wrapper> qa snapshot / click / type / key / wait / terminal`, and `<wrapper> qa reset` to start over. Note the exact labels and what each step shows afterwards. This is the only way to get labels right. Don't write them from the code.
   - The profile is fresh: `~/project` (a small git repo, starred), tabs open a plain shell, and no agent is logged in. If the feature needs more state, put it in the recipe's Setup with `lirah` commands (`lirah tasks add`, `lirah settings set`, and so on) or terminal commands (create files, make a commit).
   - Frontend edits reach the instance on the next reset (every recipe run resets it). You shouldn't need any edits here.
3. **Write `qa/recipes/<feature>.md`** in the format below.
4. **Prove it passes:** `npm run qa -- <feature>` twice. Both runs must pass. If Haiku fails on a good build, the recipe is unclear: fix the wording (labels, waits, an Expect that can be checked another way) and run it again.
5. **Prove it catches a break.** Pick the core handler behind one step, for example a button's `onClick` or the function the action calls, and stub it out (`() => {}`). First check the file has no uncommitted changes (`git diff --quiet -- <file>`); if it has some, pick another file or skip this step. Run the recipe and confirm it FAILS at that step. Then put the file back with `git checkout -- <file>` and check `git diff -- <file>` is empty. If the recipe passed with the feature broken, its Expect is too weak: tighten it and repeat.
6. **Update `qa/index.md`:** link the recipe in the Recipe column (`[name](recipes/name.md)`, which is what the runner looks for), write a few words in Covers, and put today's date in Verified. Add a row if the feature wasn't listed.

Leave the instance running when you're done unless the user asks you to stop it (`npm run qa -- --down`). In your report, list for each feature its recipe, the two passing runs, the break you tried and the step that caught it, plus any app bug you found along the way. A real bug is worth reporting. Don't make a recipe work around it.

## Recipe format

```markdown
# Feature name

One line: what the user is doing.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`.

## Steps
1. What the user does, in UI words (labels exactly as the snapshot shows them).
   **Expect:** something checkable: a snapshot line, a count in a label, page text, terminal output.
```

Rules, all learned from Haiku runs:
- **3 to 8 steps.** Haiku loses the thread on longer recipes. Cover the core journey and at most one edge case.
- **One action per step, and one checkable Expect each.** Give the exact label, count or text to look for. "Works" or "looks right" can't be checked.
- **The Expect must fail when the feature breaks.** "The button is still there" passes even when the click did nothing. Check the effect (the task shows as done, the count went up, the dialog is gone).
- **Name elements by their visible label**, never by a snapshot number: numbers change on every snapshot.
- **Steps go through the UI.** `lirah` commands are for Setup and for double-checking a result.
- **Say how to wait** when something takes time: `lirah qa wait '<text>'`, or "read the terminal until it shows X".
- `~/` means the QA profile's home: the runner rewrites it to the real path.
- **Avoid** the system folder picker, coding agents (Claude Code, OpenCode: not logged in), and network access. If a feature can't be tested without them, write that in the index row's Covers column and leave the Recipe empty.
- If the snapshot is missing something a recipe needs (an element without a label, a state it doesn't show), say so in the report. Fixing it means a small change to `src/features/agent-control/qaDriver.js` or an `aria-label` in the component, and that is the user's call.
