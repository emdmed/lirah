# Overhaul plan — features to borrow from Orca

Source: [stablyai/orca](https://github.com/stablyai/orca) ("Agent Development Environment" —
parallel agents in isolated worktrees), compared against Lirah's current code
(`src/features/*`, `src-tauri/src/*`).

Short version: Lirah already has Orca's hardest primitive — headless agent jobs in isolated
worktrees with an apply gate (`src/features/agent-jobs/AgentJobsContext.jsx:378`). Most of what
Orca has and Lirah doesn't is a thin layer on top of things already built.

## Already covered (no work needed)

Worktree-isolated agent runs, diff viewer, multi-project tabs, token analytics,
file-context/compaction, templates, patterns, instance sync, a design/diagram view.

## Highest value / lowest cost

**Status: implemented (items 1, 2, 3, 5). Item 4 turned out to already exist.**

### 1. Parallel fan-out ("race N agents on one prompt") — DONE

Orca's headline feature. Lirah already creates one worktree per job; the missing piece is
spawning *k* jobs from one prompt plus a compare view.

- In `RunJobDialog.jsx`, allow multi-select of CLI/model.
- Loop `startJob` in `AgentJobsContext.jsx:378`, tagging jobs with a shared `raceId`.
- Compare pane in `RightSidebar.jsx`: per-candidate diffstat, "apply this one, discard the rest".

Implemented: `launchRace` / `pickRaceWinner` in `AgentJobsContext.jsx`, multi-agent + copies
picker in `RunJobDialog.jsx`, `RaceGroup` compare box and a "Keep this" action in
`RightSidebar.jsx`. Keeping one candidate applies it (through the existing typecheck gate) and
discards the rest with their worktrees.

### 2. Diff annotation -> follow-up prompt — DONE

Orca lets you comment on hunks and ship the comments back to the agent. Both halves already
exist: `src/features/git/DiffContent.jsx` (line selection) and job re-prompting.

- Comment sidecar keyed by `file:line`.
- Serialize as `path:line — comment` into a follow-up job in the same worktree.

Implemented: `DiffContent` reports the selected line range upward, `GitDiffDialog` grew a review-
notes bar (pin a note to `L12-18`, list them, send), and `reviseJob` re-runs the agent in its own
worktree with the original task plus the notes — same job id, same card, revision counter.

### 3. Agent-agnostic job runner — DONE

`src-tauri/src/agent_runner/commands.rs:39` hardcodes `claude -p …` shapes; Orca supports 30+
CLIs. Extract the command template into a registry (binary, headless flag, stream format,
system-prompt flag) so opencode/codex jobs work.

Implemented: `agent_cli()` registry in `commands.rs` (claude, opencode, codex, gemini,
cursor-agent, amp), with per-agent system-prompt and stream-json handling. The dialog probes each
binary with `check_command_exists` and greys out what isn't on PATH.

### 4. Desktop notifications on job completion — ALREADY PRESENT

Correction to the original review: `fireNotification` in `AgentJobsContext.jsx` already fires a
web Notification on job completion. No `tauri-plugin-notification`, but the behaviour is there.

### 5. Worktree GC — DONE

`~/.lirah/worktrees/<repo>-<id>` is created per job and only removed on discard/apply. Abandoned
or crashed jobs leak worktrees and disk. Add a startup sweep of `git worktree list` vs live job
ids.

Implemented: `gcOrphanWorktrees` runs once after job-state hydration, resolves each unclaimed
directory back to its owning repo, and removes + prunes it through git.

## Bigger bets, genuinely useful

### 6. Browser Design Mode

Orca embeds Chromium; click a UI element, capture HTML/CSS/screenshot into the prompt.
`src/features/design/` is diagram-oriented, so this is a different feature. Tauri webview +
injected picker script + `element.outerHTML` + computed styles.

### 7. Task-tracker integration

Orca does GitHub/Linear natively. The equivalent here is Azure DevOps: pull work item -> prefill
prompt; job done -> create PR. Turns Lirah into the front-end for the sprint loop.

### 8. Headless CLI (`lirah job create ...`)

Makes jobs scriptable and cron-able without the GUI. Reuses the same runner.

### 9. Terminal

Orca is on xterm.js too — "Ghostty-class" is marketing. The real difference in their
`package.json` is `@xterm/headless` + `@xterm/addon-serialize`: a headless terminal in the main
process owns the authoritative buffer and the visible terminal is just a view. That one decision
is what gives them restart-proof scrollback, splits, and full-history search.

Done:

- **Scrollback search** — `@xterm/addon-search` behind `Ctrl+Shift+F` (`Ctrl+F` is the file
  search), with case/regex toggles and a match counter. `TerminalSearchBar.jsx`, wired into both
  the primary and secondary terminals.
- **Scrollback depth** — was xterm's 1000-line default; now 10k, configurable from the Settings
  menu (`src/lib/terminalPrefs.js`, applied live to open terminals, including other windows).
- **Unicode 11 widths** — `@xterm/addon-unicode11`, so emoji and box-drawing cells stop
  mis-measuring under Ink-based agent TUIs.

Still open, in order:

- **Session reattach with a replay buffer.** A webview reload runs no React cleanup, so
  `close_terminal` never fires, but the fresh frontend calls `spawn_terminal` unconditionally —
  new shell, blank screen, orphaned PTY. Fix with a ring buffer per session in
  `pty/manager.rs` plus an `attach_terminal` command that replays it. This is the local
  equivalent of `@xterm/headless`, and the prerequisite for splits.
- **Cross-restart scrollback** via `@xterm/addon-serialize`, stacked on the above.
- **Splits** — a larger layout refactor; only worth it after reattach exists.

## Skip

SSH/remote worktrees, mobile companion app, computer-use — high cost, and mobile only pays off
once many long jobs are in flight. Cheaper stand-in for the mobile itch: a local status HTTP
endpoint reachable from a phone on the LAN.
