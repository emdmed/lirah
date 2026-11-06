# Terminal

A project tab gives a working shell in the project folder.

## Setup
Run `lirah tabs open ~/project`, then `sleep 2`.

## Steps
1. Read terminal 1.
   **Expect:** a shell prompt in the `project` folder.
2. Type `git log --oneline` in terminal 1 and press Enter. Wait a second and read it.
   **Expect:** a line ending in `initial commit`.
3. Type `echo QA-$((40+2))` in terminal 1 and press Enter.
   **Expect:** the terminal shows `QA-42` on its own line (proves the shell ran it, not just echoed the input).
