---
name: lirah
description: Use when the user asks to change Lirah settings, startup projects, theme, or open/close/rename tabs.
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
lirah ping                     check that Lirah is reachable
```

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
