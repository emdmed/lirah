# Agent CLI launch and stop

A user browses the project's files, launches the agent from the launch bar, then jumps to a starred project, which stops the running agent first. The agent here is a fake `claude` that prints its arguments and waits.

## Setup
Run `lirah tabs open ~/project`, then `sleep 3`. Read terminal 1 until it shows a prompt ending in `project]$`. Then run these two Bash commands exactly as written (they put a fake `claude` on the terminal's PATH):

```
lirah qa terminal-type 1 "mkdir -p ~/fakebin && cp /usr/bin/sleep ~/fakebin/claude-sleep && printf '%s\n' 'echo FAKE-CLAUDE \$*' 'exec ~/fakebin/claude-sleep 600' > ~/fakebin/claude && chmod +x ~/fakebin/claude" --enter
lirah qa terminal-type 1 "export PATH=~/fakebin:\$PATH && type claude" --enter
```

Then `sleep 1` and read terminal 1: it must show `claude is` followed by a path ending in `fakebin/claude` (the path may wrap over two lines).

## Steps
1. Click the tab `The project's files`.
   **Expect:** the files list shows `src` and `README.md`.
2. Click `src`.
   **Expect:** the files list shows `index.js` and `util.js`, and no `README.md`.
3. Click `Go to parent directory`.
   **Expect:** the files list shows `src` and `README.md` again.
4. Click `▶ Launch Claude Code`, then `sleep 2` and read terminal 1.
   **Expect:** the terminal shows `FAKE-CLAUDE --plugin-dir` followed by a path ending in `.lirah/claude-plugin` (it may wrap over two lines). No new prompt follows it: the fake agent is still running.
5. Press `Ctrl+P`, then press `Enter` on the option starting `★ project`. Then `sleep 2` and read terminal 1.
   **Expect:** the palette is closed, and the terminal shows a line starting `Killed` (the fake agent was stopped), then a `cd` into a path ending in `/project`, then a prompt ending in `project]$`.
6. Type `pgrep -c claude-sleep` into terminal 1 and press Enter, then `sleep 1` and read terminal 1.
   **Expect:** the last output line before the prompt is `0`.
