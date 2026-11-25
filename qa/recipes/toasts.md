# Toasts

A user gets several notifications at once, watches them fade, undoes a deleted task from its toast, and dismisses another by hand.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`.

## Steps
1. Fire two notifications at once by running exactly this as one command: `lirah tasks add --global 'Toast one'; lirah tasks add --global 'Toast two'; lirah qa snapshot`
   **Expect:** that snapshot has both `- status "info Claude added task \"Toast one\" ×"` and `- status "info Claude added task \"Toast two\" ×"` (both showing at the same time), each followed by a button `Dismiss notification`.
2. Run `lirah qa wait 'added task "Toast two"' --gone --timeout 15`.
   **Expect:** it prints `gone`: the notifications fade by themselves.
3. Type `Toast check` into the `New task` field and press Enter.
   **Expect:** a button `Toast check` in the task list. (An error toast about formatting may appear; ignore it.)
4. Click `Delete task` and snapshot in one command: `lirah qa click <n>; lirah qa snapshot` (the toast lasts 8 seconds, so don't wait).
   **Expect:** a line `- status "info Deleted \"Toast check\" undo ×"` and a button `undo`, and no button `Toast check`.
5. Click `undo` right away.
   **Expect:** the button `Toast check` is back in the list, and the page text no longer includes `Deleted "Toast check"`.
6. Click `Delete task` and snapshot in one command again, then click the `Dismiss notification` button right after the `Deleted "Toast check"` line.
   **Expect:** the page text no longer includes `Deleted "Toast check"`, and `Toast check` is still gone from the list (dismissing does not undo).
