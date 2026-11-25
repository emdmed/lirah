# Changes

A user opens the Changes dialog from the log, jumps to the open flag with `f`, dismisses it and undoes that, copies the notes, switches to the day view's review queue, and steps back to an empty day.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`. Read terminal 1 until it shows a prompt ending in `$`, then log one finished turn that edited `README.md` and whose reply had a `⚠ F1:` line and an `Assumed:` line, by running exactly this (it has no single quotes, so wrap it in single quotes):

```
lirah qa terminal-type 1 'mkdir -p ~/.lirah/worklog && t=$(date +%s000) && printf "%s\n" "{\"type\":\"start\",\"id\":\"qa1\",\"at\":$t,\"prompt\":\"Tidy the README\",\"repo\":\"$PWD\",\"cwd\":\"$PWD\",\"branch\":\"main\"}" "{\"type\":\"end\",\"id\":\"qa1\",\"at\":$t,\"files\":[\"README.md\"],\"flags\":[{\"n\":\"F1\",\"text\":\"The install steps are untested\"}],\"assumptions\":[\"Node 20 is the minimum\"]}" >> ~/.lirah/worklog/$(date +%Y-%m).jsonl && echo seeded' --enter
```

Read terminal 1 until it shows `seeded`.

## Steps
1. Click the Workspace pane's `LOG` section tab (the section tabs show no name in the snapshot; the page text reads `TASKS PLANS LOG JOBS`, so pick the third one).
   **Expect:** radios `decisions` (checked), `all logs 1` and `changes` are listed.
2. Click the `changes` radio.
   **Expect:** a dialog is open with heading `Changes in project`, radio `Week` (checked), and a summary `No feature 1 open flag · 1 assumption 1 change · 1 turn`. The page text includes `to review · 1 open flag · 1 unchecked assumption · 1 without a unit test`, and does not include `The install steps are untested` (features start folded).
3. Press `f`.
   **Expect:** the feature opens on its flag: the page text includes `F1 The install steps are untested` and `Node 20 is the minimum`, and the snapshot has buttons `ask agent`, `dismiss`, `right` and `wrong`.
4. Click `dismiss`.
   **Expect:** the page text includes `0 open flags` and `✓ dismissed`, the snapshot has a button `undo` and no button `dismiss`, and the summary reads `No feature 1 assumption 1 change · 1 turn`.
5. Click `undo`.
   **Expect:** the page text includes `1 open flag · 1 unchecked assumption`, and the snapshot has the button `dismiss` again and no button `undo`.
6. Press `c`.
   **Expect:** `lirah qa wait 'Copied notes'` finds it (a toast `Copied notes for 1 feature`).
7. Click the `Day` radio.
   **Expect:** the snapshot has buttons `Previous day` and `Tidy the README, 1 turn, show in the list`, and the page text includes `CHANGES THIS DAY`, `OPEN FLAGS · 1`, `ASSUMPTIONS · 1` and `NO UNIT TEST · 1`.
8. Click `Previous day`.
   **Expect:** the page text includes `No changes this day` and `0 FEATURES`, the button `Next day` is enabled (not `disabled`), and the dialog is still open.
