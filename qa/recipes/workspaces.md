# Workspaces

A user makes a second workspace with its own tab, and switches between workspaces. Each one shows only its own tabs.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`.

## Steps
1. Click `New workspace`.
   **Expect:** a button starting `ws 2: 0 tabs`, and a chooser listing an option starting `★ project` and an option starting `~ home`.
2. Click the option starting `~ home`.
   **Expect:** the workspace button now reads `ws 2: 1 tab`, and the tab list has exactly one tab button, whose label is the home folder path (it does NOT contain `/project`).
3. Click the button starting `main: 1 tab`.
   **Expect:** the tab list shows one tab button whose label contains `/project`, and no tab button for the plain home folder. `lirah tabs list` lists only the `project` tab.
4. Press `Alt+W`.
   **Expect:** the tab list is back to the home-folder tab (its label does NOT contain `/project`). `lirah tabs list` lists only that tab.
