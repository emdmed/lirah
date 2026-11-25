# Changes

A user opens the Changes dialog from the log, folds and opens a feature, copies the notes, switches to the day view and back, and steps back to an empty week.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`. Read terminal 1 until it shows a prompt ending in `$`, then log one finished turn that edited `README.md` by running exactly this (it has no single quotes, so wrap it in single quotes):

```
lirah qa terminal-type 1 'mkdir -p ~/.lirah/worklog && t=$(date +%s000) && printf "%s\n" "{\"type\":\"start\",\"id\":\"qa1\",\"at\":$t,\"prompt\":\"Tidy the README\",\"repo\":\"$PWD\",\"cwd\":\"$PWD\",\"branch\":\"main\"}" "{\"type\":\"end\",\"id\":\"qa1\",\"at\":$t,\"files\":[\"README.md\"]}" >> ~/.lirah/worklog/$(date +%Y-%m).jsonl && echo seeded' --enter
```

Read terminal 1 until it shows `seeded`.

## Steps
1. Click the Workspace pane's `LOG` section tab (the section tabs show no name in the snapshot; the page text reads `TASKS PLANS LOG JOBS`, so pick the third one).
   **Expect:** radios `decisions` (checked), `all logs 1` and `changes` are listed.
2. Click the `changes` radio.
   **Expect:** a dialog is open with heading `Changes in project`, radio `Week` (checked), and a summary `No feature 1 change · 1 turn`. The page text includes `Tidy the README`.
3. Click the summary `No feature 1 change · 1 turn`.
   **Expect:** the feature folds: the page text no longer includes `Tidy the README`, and the summary is still listed.
4. Click the summary `No feature 1 change · 1 turn` again.
   **Expect:** the page text includes `Tidy the README` again.
5. Press `c`.
   **Expect:** `lirah qa wait 'Copied notes'` finds it (a toast `Copied notes for 1 feature`).
6. Click the `Day` radio.
   **Expect:** the snapshot has buttons `Previous day` and `Tidy the README, 1 turn, open in the week list`, and the page text includes `CHANGES THIS DAY`.
7. Click the `Week` radio.
   **Expect:** the snapshot has a button `Previous week` and the page text includes `CHANGES THIS WEEK`.
8. Click `Previous week`.
   **Expect:** the page text includes `No changes this week` and `0 FEATURES`, the button `Next week` is enabled (not `disabled`), and the dialog is still open.
