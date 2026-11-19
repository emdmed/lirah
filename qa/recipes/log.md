# Log

Smoke check: a user opens the Workspace pane's log and switches through its three views without the pane crashing.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`.

## Steps
1. Click the Workspace pane's `LOG` section tab (the section tabs show no name in the snapshot; the page text reads `TASKS PLANS LOG JOBS`, so pick the third one).
   **Expect:** radios `decisions` (checked), `all logs` and `summary` are listed, and the page text includes `no decisions yet` (any case).
2. Click the `all logs` radio.
   **Expect:** the page text includes `no prompts yet` (any case), and the `decisions` and `summary` radios are still listed.
3. Click the `summary` radio.
   **Expect:** the page text includes `no prompts today` (any case), a button `today` is listed, and the `decisions` radio is still listed.
4. Click the `decisions` radio.
   **Expect:** the page text includes `no decisions yet` again, and the `all logs` radio is still listed.
