# Zen columns

A user in Zen puts a second tab beside the first, moves between the two columns with Ctrl+Alt+1 and Ctrl+Alt+2, then closes one column's tab and is left with one column.

Two columns need a window about 1300px wide (each column needs ~70 terminal columns). In a narrower window step 2 shows `too narrow for 2 columns` instead: maximize the QA window first.

## Setup
Run `lirah tabs open ~/project` twice, then `sleep 2`, then press `Alt+Z`.

## Steps
1. Take a snapshot.
   **Expect:** exactly one button whose label ends in `column 1` (the focused tab's lamp on the bottom line), and none ending in `column 2`.
2. Press `Alt+4`, then `Home`, then `2`, then `Escape`.
   **Expect:** the snapshot has one button ending in `column 1` and one ending in `column 2`. `lirah tabs list` marks tab 2 with `*`.
3. Press `Ctrl+Alt+2`.
   **Expect:** `lirah tabs list` marks tab 1 with `*`. Press `Ctrl+Alt+1` and check that `lirah tabs list` marks tab 2 with `*` again.
4. Press `Ctrl+W`. If a `Close project?` dialog opens, click `Close tab`.
   **Expect:** `lirah tabs list` shows one tab, and the snapshot has one button ending in `column 1` and none ending in `column 2`.
