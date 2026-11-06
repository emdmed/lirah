---
name: lirah-qa
description: Check Lirah for regressions by running the agentic QA recipes (Haiku drives a real, throwaway app instance through each feature's recipe in qa/index.md), or drive a QA instance by hand to verify a UI change. Use for "run QA", "check for regressions", "test the app", "verify this works in the app". Writing recipes is the user-run /qa-recipes command, not this skill.
---

Read `qa/README.md` first.

- **Check for regressions:** `npm run qa` for everything, or `npm run qa -- <feature>` for the recipes your change touches. Run it in Bash with the sandbox disabled, because it opens a window. Report each FAIL with its failed steps and evidence. A FAIL on a recipe your change touched is a regression until shown otherwise: reproduce it by hand (below) before blaming the recipe.
- **A recipe looks stale** (a label changed on purpose): say which one and suggest the user run `/qa-recipes <feature>`. Don't rewrite recipes here.
- **Verify a UI change yourself:** `npm run qa -- --up` in the background, export the two variables it prints, `unset LIRAH_PTY_SESSION LIRAH_WORKSPACE` (inside a Lirah tab they point at the real app), then use `lirah qa ...` as described in `qa/AGENT.md`. Stop the instance when done.
