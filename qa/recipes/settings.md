# Settings: change the theme

A user opens Settings, switches the theme, and the app applies it.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`. Run `lirah theme get` and remember the result (the start theme).

## Steps
1. Click `Settings and actions`, then the `Settings…` menu item.
   **Expect:** a dialog with the heading `SETTINGS` (any letter case) and tabs like `Agent` and `Appearance`.
2. Click the `Appearance` tab.
   **Expect:** a list of themes.
3. Pick any theme other than the start theme.
   **Expect:** `lirah theme get` now prints a different theme than at the start, and the `Appearance` tab label names the new theme.
4. Press `Escape`.
   **Expect:** the dialog is closed: a fresh snapshot no longer starts with the dialog notice, and the `Settings and actions` button is listed again.
