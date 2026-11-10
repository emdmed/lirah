# Bookmarks (starred projects)

A user stars a folder under a name, finds it in the starred list, and jumps to it from the Ctrl+P palette.

## Setup
Run `lirah tabs open ~/project`, then `lirah tabs open ~/project/src`, then `sleep 2`. The `src` tab is active.

## Steps
1. Click `Starred projects`, then the `Star this project` menu item.
   **Expect:** a dialog with the heading `STAR PROJECT` (any letter case), a name field holding `src`, and a path field ending in `/project/src`.
2. Replace the name with `QA sources` and click `Star`.
   **Expect:** the dialog closes. Clicking `Starred projects` again lists a menu item starting `QA sources` whose path ends in `/project/src`. Press `Escape` to close the menu.
3. Click the tab button whose label ends in `/project` followed by `idle` (the one without `src`). Read terminal 1 until it shows a prompt.
   **Expect:** `lirah tabs list` marks the `project` tab active (`*`).
4. Press `Ctrl+P`, then type `sources` into `Filter starred projects`.
   **Expect:** a dialog with the heading `^P STARRED PROJECTS` (any letter case) listing exactly one option, starting `★ QA sources`.
5. Press `Enter`. Wait a second and read terminal 1.
   **Expect:** the palette is closed, and terminal 1 shows a `cd` into a path ending in `/project/src` followed by a prompt ending in `src]$`.
