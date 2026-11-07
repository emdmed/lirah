# Tabs

A user opens a second tab, renames it, switches between tabs, and closes one.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`.

## Steps
1. Click `new tab` (the last row of the tabs list) and pick the starred `project` entry (never the system folder picker).
   **Expect:** the `TABS` button shows 2, and two tab buttons are listed.
2. Click the newest tab button, then press `F2`, type `qa-renamed` into the field that appears, and press `Enter`.
   **Expect:** a tab button containing `qa-renamed`. `lirah tabs list` shows it too.
3. Click the other tab.
   **Expect:** `lirah tabs list` marks the other tab active (`*`).
4. Close the `qa-renamed` tab through the UI (a close button, the tab's menu, or a shortcut). Confirm if asked.
   **Expect:** `TABS` shows 1 and `qa-renamed` is gone from the page.
