# Tasks

A user adds a task in the Tasks panel, marks it done, and deletes it.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`.

## Steps
1. Click the `TASKS` button.
   **Expect:** a `New task` text field.
2. Type `Check the QA flow` into `New task` and press Enter.
   **Expect:** a button `Check the QA flow` in the list, and the `TASKS` button now shows a count of 1.
3. Click `Mark done` for that task.
   **Expect:** the task shows as done (moved to a done section, struck through, or its button now reads reopen).
4. Delete the task with `Delete task` (confirm if asked).
   **Expect:** `Check the QA flow` is no longer anywhere on the page.
