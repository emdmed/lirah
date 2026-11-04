---
name: lirah
description: Use when the user asks to change Lirah settings, startup projects, theme, open/close/rename tabs, to list, add, finish, edit, delete or move tasks in Lirah's task list, to list, import or check off Lirah plans and their chunks, or to start, list, inspect, cancel or apply Lirah's background agent jobs.
---

# Configuring Lirah with the `lirah` command

You are running inside a tab of Lirah, the terminal app. The `lirah` command on
your PATH changes the app itself. Run it with the Bash tool. It only works from
inside a Lirah tab.

Always run `lirah settings list` before guessing a setting's key name. It
prints every key with its current value, default, allowed values and a short
description. Don't invent keys.

## Commands

```
lirah settings [list]          list settings: key, value, default, allowed, description
lirah settings get <key>       print one setting's value
lirah settings set <key> <v>   change a setting (booleans take on/off)
                               e.g. `figures full|compact`: drawn figures or plain text
lirah settings reset <key>     put a setting back to its default
lirah theme [list]             list themes (* marks the current one)
lirah theme get                print the current theme
lirah theme set <name>         switch theme (id or display name)
lirah tabs [list]              list tabs (* active, > this tab)
lirah tabs open <path> [--launch]
                               open a tab in <path>; --launch starts its agent
lirah tabs close <tab>         close a tab (asks if its agent is busy)
lirah tabs rename <tab> <name> rename a tab (empty name: automatic again)
lirah tabs focus <tab>         switch to a tab
lirah startup                  show what opens at launch
lirah startup mode restore|projects
                               reopen the last tabs, or open the startup projects
lirah startup add <path> [--launch] [--name N]
                               add (or update) a startup project
lirah startup remove <path>    remove a startup project
lirah startup clear            remove all startup projects
lirah tasks [list] [--global] list this tab's project tasks (--global: global)
                               --json includes each task's notes
lirah tasks add <title> [--notes N] [--global]
                               add a task to this tab's project list
                               (--global: the global list)
lirah tasks done|reopen <id>   mark a task done, or not done again
lirah tasks edit <id> [--title T] [--notes N]
                               change a task's title or notes (--notes replaces them)
lirah tasks remove <id>        delete a task (the user can undo from a toast)
lirah tasks move <id>          move between this project's list and the global list
                               task commands take --global to act on the global list
lirah plans [list]             list this tab's repo plans and their progress
lirah plans show <plan>        a plan's chunks and their state
lirah plans import <file>      import a *_plan.md file as a plan (split into chunks)
lirah plans done <plan> <chunk> [--result T]
                               mark the chunk in progress done; --result says what
                               was done when there's nothing to commit
lirah plans debug <plan> [--fix]
                               find what's stuck or broken in a plan; --fix applies
                               the safe repairs and checks again
lirah jobs [list] [--all]      this tab's repo's background jobs (--all: every repo)
lirah jobs run <prompt> [--cli C] [--label L]
                               start a background job in this tab's repo, in an
                               isolated worktree (asks the user first)
lirah jobs show <job> [--all]  one job's details
lirah jobs cancel <job> [--all]
                               stop a running job
lirah jobs apply <job> [--force] [--all]
                               apply a finished job's changes to its repo
                               (asks the user first)
lirah ping                     check that Lirah is reachable
```

`<plan>` is an index from `lirah plans`, an id or a title; `<chunk>` is its
number or id.
`<job>` is an index from `lirah jobs` or a job id. An index from `lirah jobs --all`
needs `--all` again.
`<tab>` is `.` (this tab), an index from `lirah tabs`, a tab id or a tab name.
Add `--json` to any command for machine-readable output. `lirah help` prints
the full usage.

## Notes

- Errors go to stderr and exit 1. Read the message and fix the call; don't retry
  blindly.
- Some changes (sandbox, hooks, agent control itself) ask the user to confirm in
  the app. If the reply is `denied by user`, tell the user and stop; do not retry.
- Sandbox, network isolation and the selected CLI only change the default for new
  tabs, not the current one.
- `lirah tabs close .` closes your own tab and ends this session. Only do it when
  the user asks.
- For startup projects to open at launch, the mode must be `projects`:
  `lirah startup mode projects`.
- Paths are resolved against your current directory.
- After writing a `*_plan.md` the user wants run in Lirah, import it with
  `lirah plans import`. Splitting takes a moment; check `lirah plans show`.
- When you finish the plan chunk you were sent, commit, then run
  `lirah plans done <plan> <chunk>`. With nothing to commit, pass `--result`.
- When a plan looks stuck or broken, debug it:
  1. `lirah plans debug <plan>` to see what's wrong.
  2. `lirah plans debug <plan> --fix`, which applies the safe repairs and checks again.
     A fix that needs you (e.g. committing a chunk's work) is in its hint; do it, then
     debug again. Don't roll back, delete or re-send chunks unless the user asks.
  3. If problems remain, read `lirah plans debug <plan> --json` (it has the plan's
     stored state) and look for the cause. Fix it if you can with these commands.
  4. If it still can't be fixed, add one task with a short problem explanation:
     `lirah tasks add "Plan <title>: <the problem in a few words>" --notes "..."`,
     with notes saying what's wrong, what you tried, and the plan and chunk ids.
     Tell the user. Don't edit Lirah's plans.json by hand.
- Task ids come from `lirah tasks`. Only delete a task when the user asks.
- Run `lirah tasks` before adding, so you don't add a task that's already there.
- A task title is one line; put details in `--notes` (markdown is fine). Quote
  both so the shell keeps them whole.
- `lirah jobs` gives each job's run report path. Read the report with your file
  tools; it has the prompt, changed files and full output. A running or cancelled
  job has no report yet, so read its log path instead.
- `lirah jobs apply` asks the user to confirm. It lands the changes uncommitted in
  the repo. On `denied by user`, stop. When the typecheck blocks it, tell the user.
  Only pass `--force` when they say so.
- Only cancel a job when the user asks. Its worktree is kept.
- `lirah jobs run "<prompt>"` starts a job when the user asks for work in the
  background (or in parallel). The job's agent starts with no context, so write a
  complete, self-contained prompt: the goal, the files, the constraints, and how to
  verify. Quote it. Split independent work into separate jobs that touch different
  files. The user confirms each launch; on `denied by user`, stop. Then check on it
  with `lirah jobs show <id>`, and apply it only when the user says so.
- You can't rerun, revise or archive jobs, or start or settle races, from the CLI.
  Point the user to the jobs pane.
