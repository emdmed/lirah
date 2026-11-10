# Keyboard shortcuts

A user gets around with the keyboard: the shortcuts help, switching tabs, and opening and closing tabs. (Alt+W is covered by the workspaces recipe, Ctrl+P by bookmarks.)

## Setup
Run `lirah tabs open ~/project`, then `lirah tabs open ~/project/src`, then `sleep 2`. There are two tabs, and the `src` one (tab 2) is active.

## Steps
1. Press `Ctrl+H`.
   **Expect:** a dialog with the heading `^H KEYBOARD SHORTCUTS` (any letter case), and its text (`lirah qa text`) includes `New Tab` and `Close Tab`. Press `Escape` and check the dialog is gone.
2. Press `Ctrl+1`.
   **Expect:** `lirah tabs list` marks tab 1, the `project` tab, active (`*`).
3. Press `Ctrl+Tab`.
   **Expect:** `lirah tabs list` marks tab 2, the `src` tab, active.
4. Press `Ctrl+T`.
   **Expect:** a dialog with the heading `^T NEW TAB` (any letter case), with the option for the current folder (`↵ src`) selected.
5. Press `Enter`.
   **Expect:** the dialog closes, the snapshot shows a button starting `main: 3 tabs`, and `lirah tabs list` shows a third tab, in `/project/src`, active.
6. Press `Ctrl+W`.
   **Expect:** the snapshot shows a button starting `main: 2 tabs`, and `lirah tabs list` shows two tabs.
