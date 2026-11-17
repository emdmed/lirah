# Lirah for Omarchy

A bar widget for [Lirah](https://github.com/emdmed/ao-terminal): what its agents are doing, and its notifications with a way back to the tab.

- **Bar:** the Lirah lyre. The body in its ring is a lamp: hollow when nothing runs, lit with a count while agents work, and in the bar's urgent colour with a count when agents wait on you. Dimmed when Lirah isn't running.
- **Panel** (left click): every tab of every workspace, grouped as waiting on you, working and quiet, with how long it has been in that state and the plan it works through (a chunk ruler, `done/total`, auto-pilot status). Click a row, or move with j/k or the arrows and press Enter, to go to that tab. `o` (or the button) raises Lirah, or starts it when it isn't running.
- **Right click:** raise Lirah.
- **Notifications:** Lirah's own (an agent needs permission or finished a long turn, an auto-pilot run stopped or finished, a job finished) shown through the desktop with a *Go to tab* button. While the widget polls, Lirah keeps its webview notifications quiet, so nothing shows twice. Omarchy's Do Not Disturb silences them like any other.

It reads Lirah's control socket (`~/.lirah/control/<pid>.sock`, the newest one when several Lirahs run) every 2 seconds with `status.get`, and needs a Lirah that has that command.

## Install

```sh
cp -r packaging/omarchy/io.github.emdmed.lirah ~/.config/omarchy/plugins/
rm ~/.config/omarchy/plugins/io.github.emdmed.lirah/test.mjs
```

Then add `{ "id": "io.github.emdmed.lirah" }` to a section of `bar.layout` in `~/.config/omarchy/shell.json`. Copy rather than symlink: the shell doesn't hot-reload plugins outside its config folder.

IPC: `omarchy-shell io.github.emdmed.lirah open|close|toggle|status|raise`.

Check the model with `node test.mjs`.
