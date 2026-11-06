# Command palette

A user opens the `:` command palette, filters it, and runs commands that open a second terminal and a new tab.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`.

## Steps
1. Click the `TABS` button (this takes focus out of the terminal), then press `:`.
   **Expect:** a `Command` text field, and options including `tab new tab in this project` and `term toggle the secondary terminal`.
2. Type `term` into the `Command` field.
   **Expect:** the list narrows: `term toggle the secondary terminal` is listed and selected, and `tab new tab in this project` is gone.
3. Press `Enter`.
   **Expect:** a list of choices including `$ shell commands`, `› nvim editor` and `± lazygit git`.
4. Press `Enter` again (the `$ shell commands` choice is selected).
   **Expect:** a second terminal is open: `lirah qa terminal 2` shows a prompt in the `project` folder.
5. Click the `TABS` button, press `:`, and type `tab` into the `Command` field.
   **Expect:** `tab new tab in this project` is listed and selected.
6. Press `Enter`.
   **Expect:** the `TABS` button reads `TABS 2`, and `lirah tabs list` shows two `project` tabs with the second one active (`*`).
