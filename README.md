# Lirah

A native desktop workspace for CLI coding agents. Lirah runs your agent (Claude Code, opencode, or headless Codex, Gemini, Cursor and Amp) in a real terminal and builds what a session needs around it: file context, prompts, git, token budgets, background jobs and multi-step plans.

Lirah doesn't wrap or replace the agent. The terminal stays in the centre, and everything else is a pane, a key or a `:` command away.

Built with **Tauri 2**, **React 19** and **xterm.js**. Linux is the primary platform. macOS and Windows builds exist, without the sandbox.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/emdmed/lirah/main/scripts/install.sh | bash
```

The script picks the latest [release](https://github.com/emdmed/lirah/releases) for your distro and architecture (x86_64 or aarch64) and checks its SHA-256:

| Distro family | What it installs |
|---|---|
| Debian, Ubuntu, Mint, Pop!_OS | `.deb` |
| Fedora, RHEL, openSUSE | `.rpm` |
| Arch, Manjaro, EndeavourOS, Omarchy, CachyOS | Builds from source (the AppImage has EGL issues there) and prompts for missing build tools |
| Anything else | AppImage |

macOS (`.dmg`) and Windows (`.exe`, `.msi`) installers are on the releases page.

**Optional tools:** `bwrap` (bubblewrap) for the sandbox, `lazygit` for Alt+L, `nvim` for Alt+N.

### Build from source

You need [Rust](https://rustup.rs/) (stable), [Node.js](https://nodejs.org/) 18+, the [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/), and cairo with pkg-config. On Linux, `./scripts/install-deps.sh` installs cairo and pkg-config with apt, dnf or pacman.

```bash
git clone https://github.com/emdmed/lirah.git
cd lirah
npm install
npm run tauri:build
```

The bundles land in `src-tauri/target/release/bundle/`. To open a directory at startup, run `lirah <dir>`.

## Features

### Layout and tabs
- Four numbered panes, focused with Alt+1–4: **[1] Files**, **[2] Terminal**, **[3] Prompt**, **[4] Workspace**. A secondary terminal (Ctrl+\`) opens beside the main one.
- Up to 8 project tabs, each with its own PTY, CLI, sandbox and sidebar state. Tabs persist and boot lazily when you return to them.
- Tab rows show a context-fill moon, an activity lamp, the branch, the files the agent edited in its last turn, and the plan the tab is working through.
- Agent hooks (installed automatically for Claude Code and opencode) report working, permission, waiting and done states. Alt+A jumps to the next agent waiting on you, and desktop notifications follow.
- Terminals survive a webview reload: sessions detach, reattach and replay their output.

### Terminal
- xterm.js on a login-shell PTY with WebGL rendering and flow control.
- Scrollback search (Ctrl+Shift+F) and scrollback from 1k to 200k lines.
- A launch bar while no agent is running. Ctrl+K launches the tab's CLI and Ctrl+Shift+L clears its context.
- Ctrl+S switches to navigation mode, stopping the agent first (it asks if the agent is busy).

### Sandbox (Linux)
- An optional per-tab bubblewrap sandbox. The root filesystem is read-only, while home and the project are writable. `.ssh`, `.gnupg`, shell rc files, `.gitconfig` and autostart stay read-only, `/tmp` is private, and the PID, IPC and UTS namespaces are isolated.
- Optional network isolation on top of the sandbox.
- On Ubuntu 24.04+, Lirah installs an AppArmor profile when one is needed. If the sandbox fails to start, a toast offers to retry without it.

### Files
- Flat or virtualized tree view with vim keys (j/k, g/G, l/h, `/` to search, X to collapse all).
- Git colouring and +/- line badges, updated live by a native file watcher.
- Filters for git changes (Ctrl+G, where clicking a file opens its diff), markdown (Ctrl+M, where clicking opens the viewer) and file names (Ctrl+F).
- Pinned files (`p` on a row), shared across tabs.

### Prompt and context
- A multi-line prompt that sits over the bottom of the terminal. Ctrl+Enter sends it, and Ctrl+Shift+Z restores the last one.
- File chips with a per-file intent (EDIT, READ or COPY) and detail level (full, signatures or skeleton). The default detail level depends on file size.
- `@` searches for files inline in the prompt.
- **Instructions** (double-tap Alt): prompt templates plus the repo's `.patterns/*.md` conventions.
- **Context sets:** save the current file selection under a name and restore it later.
- **Compact project** (Ctrl+Shift+P): attaches a structural skeleton of every JS, TS and Python file, with sections you can toggle.
- A live token cost estimate as you type.

### Git
- **Auto commit** (Ctrl+Shift+Space): an agent drafts a conventional commit message for you to edit.
- **Auto merge** (Alt+M): merges the feature branch into a base, fast-forward or `--no-ff`. It shows the git commands first, rolls back on a conflict or failed check, and understands worktrees.
- **Auto changelog:** after a commit or merge, a headless agent updates `CHANGELOG.md`, with Undo in the toast.
- **Diff viewer:** side-by-side word-level diffs, collapsible unchanged regions and review notes.

### Background jobs (Workspace → jobs)
- Run headless agents on a template plus context files, optionally in an isolated git worktree.
- **Race** several agents on the same task and compare the results side by side.
- Review the diff and send notes back to the agent, then apply (gated by a TypeScript check), re-run or discard.
- **Reconcile** merges several jobs in an integration worktree. A watchdog stops any job stuck for 15 minutes.

### Plans and auto-pilot (Workspace → plans)
- Paste a plan or import the repo's `*_plan.md` files. An agent splits the plan into chunks.
- For each chunk: implement it in the tab's agent (one commit per chunk), review it with notes, roll back, skip or reorder.
- **Auto-pilot** (`:autopilot`) chains chunks unattended. It pauses on questions, permission prompts, a missing commit, or when the agent hooks go silent.

### Tokens and budget
- A context meter in the status bar for the tab's Claude session, subagents included.
- A token dashboard (Ctrl+Shift+D) with history, a calendar heatmap, project comparison, model cost insights and CSV/JSON export.
- Daily and weekly budgets per project (Ctrl+Shift+B), with alerts at 80% and 95%.

### Projects
- **Starred projects** (Ctrl+P) open from a searchable palette.
- **Workspaces** group several repos into one folder of symlinks with a generated `CLAUDE.md`.

### Everything else
- `:` opens a vim-style command line with fuzzy matching and argument completion.
- 18 themes. Tokyo Night is the default, and the set includes Rivendell, Flexoki Light and Catppuccin Latte.
- A markdown viewer, an update checker against GitHub releases, and one searchable Settings dialog.

## Keyboard shortcuts

Ctrl+H lists every shortcut, and holding Ctrl or Ctrl+Shift shows a hint bar. The most used:

| Keys | Action |
|---|---|
| `Alt+1`–`4` | Focus files, terminal, prompt or workspace pane |
| `:` / `Ctrl+:` | Command palette |
| `Ctrl+T` / `Ctrl+W` | New tab / close tab |
| `Ctrl+1`–`9`, `Ctrl+Tab` | Switch tabs |
| `Alt+A` | Jump to the next agent waiting on you |
| `Ctrl+K` | Launch the CLI |
| `Ctrl+Shift+L` | Clear CLI context |
| `Ctrl+S` | Navigation mode |
| `Ctrl+Enter` | Send prompt |
| `Alt Alt` | Instructions picker (double-tap) |
| `Ctrl+Shift+P` | Compact project |
| `Ctrl+F` / `Ctrl+G` / `Ctrl+M` | File search / git filter / markdown filter |
| `Ctrl+Shift+F` | Search terminal output |
| `Ctrl+Shift+Space` | Auto commit |
| `Alt+M` | Merge branch into base |
| ``Ctrl+` `` | Secondary terminal |
| `Alt+L` / `Alt+N` | Lazygit / Nvim |
| `Ctrl+P` | Starred projects |
| `Ctrl+Shift+D` / `Ctrl+Shift+B` | Token dashboard / budgets |

The list lives in `src/lib/shortcuts.js`, which the help dialog, the hint bar and the palette all read.

## Development

```bash
npm run dev            # Tauri app with Vite hot reload
npm run dev:vite       # Frontend only
npm run dev:instance   # Extra dev instance on its own ports (node scripts/dev.js 2)
npm run build          # Frontend production build
npm run tauri:build    # Full app bundles
```

Checks:

```bash
npm run check:contrast        # Legibility of the instrument tokens in every theme
npm run check:async-commands  # Fails on sync Tauri commands that do IO (they freeze the UI thread)
npm run check:bundle          # Startup JS size budget (run npm run build first)
```

### Layout of the code
- `src/features/*`: one folder per feature (tabs, agent-jobs, plans, token-budget, compact, bookmarks, settings and so on).
- `src/hooks`, `src/components`, `src/lib`: shared hooks, UI primitives and the shortcut registry.
- `src/themes/theme-config.js`: every theme's terminal and UI colours.
- `src-tauri/src`: the Rust backend. It covers the PTY, file system and file watcher, git, agent runner and hooks, plans, Claude session and token parsing, and workspaces.

Product and design notes are in [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
