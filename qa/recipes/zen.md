# Zen mode

A user turns on Zen: the panes and top rail go away, leaving the terminal, a strip above it and a line at the bottom. They fold the strip's turn row, open the files and tabs drawers, and turn Zen off again.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`.

## Steps
1. Press `Alt+Z`.
   **Expect:** the snapshot has a button `Tabs (Alt+4)` and a button `Fold the turn row`, and no button `New workspace` (the Workspace pane is hidden). The page text (`lirah qa text`) includes `no turn yet`. `lirah settings get zenMode` prints `true`.
2. Click `Fold the turn row`.
   **Expect:** the same button now reads `Show the turn row`, and the page text no longer includes `no turn yet`.
3. Press `Alt+1`.
   **Expect:** the page text includes `nothing touched this turn` (the files drawer). Press `Escape` and check, with `lirah qa wait 'nothing touched this turn' --gone`, that the drawer closed.
4. Click `Tabs (Alt+4)`.
   **Expect:** the snapshot has an option starting `project, idle` (the tabs drawer, with the tab's row). Press `Escape` and check that option is gone.
5. Press `Alt+Z`.
   **Expect:** the snapshot has a button `New workspace` again, and no button `Tabs (Alt+4)`. `lirah settings get zenMode` prints `false`.
