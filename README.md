# Lirah

A native desktop app for CLI agents. Keep your files, prompts, and terminal perfectly in sync—so you can focus on shipping, not wrangling context.

Built with **Tauri 2** | **React 19** | **xterm.js** | **TypeScript**

**Tested with**: Claude Code, opencode, and other CLI agents

## Installation

### Quick Install

**Ubuntu/Debian:**

```bash
curl -fsSL https://raw.githubusercontent.com/emdmed/lirah/main/scripts/install.sh | bash
```

**Arch Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/emdmed/lirah/main/scripts/install.sh | bash
```

On Arch-based distros, the installer builds from source to avoid AppImage EGL compatibility issues. This requires Rust, Node.js, and Tauri build dependencies (the script will prompt to install any that are missing).

### Build from Source

**Prerequisites:**
- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18+)
- Your preferred CLI agent (Claude Code, opencode, etc.)
- System libraries: `libcairo2-dev` `pkg-config`

**Linux Users:**
```bash
# Install dependencies automatically
./scripts/install-deps.sh

# Or install manually:
# Ubuntu/Debian
sudo apt install libcairo2-dev pkg-config

# Fedora/CentOS
sudo dnf install cairo-devel pkgconfig

# Arch Linux
sudo pacman -S cairo pkgconf
```

```bash
git clone https://github.com/emdmed/lirah.git
cd lirah
npm install
npm run tauri:build
```

The built application will be in `src-tauri/target/release/`.

## Why Lirah?

| | |
|---|---|
| **Native & Fast** | Lightweight Tauri app, not an Electron behemoth |
| **Better Output** | Structured context = better AI agent results |
| **Universal** | Works with any CLI agent (Claude Code, opencode, etc.) |
| **Real Workflows** | Designed for actual development, not demos |
| **Terminal-First** | Terminal-first, not terminal-hostile |

If you use CLI agents seriously, Lirah becomes the place you run them.

## Features

### Core

- **Terminal Emulator** — Full xterm.js terminal with PTY integration, session management, and automatic CWD monitoring. The terminal is the primary interface — everything else enhances it.
- **Secondary Terminal** — A second terminal panel for running background processes (tests, servers, git log) without leaving your main session. Pick from preset commands or type your own.
- **Tauri Desktop App** — Native Linux desktop app built with Tauri 2. Lightweight, fast startup, custom title bar with window controls.

### File Navigation & Management

- **File Tree View** — Hierarchical project browser with expand/collapse folders, git status badges, and file selection for AI context.
- **Flat View Navigation** — Alternative flat directory listing with parent navigation. Quick for jumping between directories.
- **File Search** — Filter files in the sidebar by name. Keyboard-driven with `Ctrl+F`.
- **Git-Only Filter** — Toggle (`Ctrl+G`) to show only files with uncommitted git changes. Useful for reviewing what you've touched.
- **File Watcher** — Monitors the filesystem for changes and auto-refreshes the sidebar tree. Toggle with `Ctrl+W`.

### AI / CLI Integration

- **CLI Selection** — Switch between CLI agents (Claude Code, opencode, etc.) with automatic availability detection.
- **Claude Launcher** — Launch Claude Code sessions directly from within Lirah with `Ctrl+K`.
- **Prompt Textarea Panel** — Multi-line editor for composing prompts. Attach files, apply templates, toggle orchestration context, and send everything to your CLI agent with `Ctrl+Enter`.
- **Orchestration Protocol** — Auto-detects and installs the [Agentic Orchestration Workflows](https://agentic-orchestration-workflows.vercel.app/) system, served via CDN for always-up-to-date workflow definitions. Appends workflow instructions to your prompts so the agent follows structured development processes (feature, bugfix, refactor, review, etc.). The orchestration system includes compaction scripts, dependency graph analysis, and symbol indexing tools.
- **Token Cost Estimator** — Shows estimated cost (input tokens × model pricing) before you send a prompt, so you know what you're spending.

### File Context & Analysis

- **File Selection** — Click files in the tree to attach them as context to your prompt. Selected files appear in the textarea panel with per-file controls.
- **File State Management** — Set each selected file to a state that controls how much detail is sent:
  - **Full** — Entire file contents
  - **Signatures** — Function signatures and structure only
  - **Skeleton** — Imports, exports, and component map
  - Auto-selects based on file size (< 300 lines → full, 300-799 → signatures, 800+ → skeleton).
- **Element Picker** — Opens a dialog to pick individual symbols (functions, components, types, constants) from a file using Babel (JS/TS) or Python AST parsing. Send only the specific code you need.
- **Type Checker** — Run TypeScript type checking on selected files and surface errors directly in the UI, without leaving Lirah.
- **@-Mention System** — Type `@` in the textarea to search and attach files inline, similar to chat apps.

### Project Compaction

- **Project Compact** — Compresses your entire project into a token-efficient summary: imports, exports, function signatures, component props, and hook usage. Achieves ~95% token reduction.
- **Compact Sections Dialog** — View and toggle individual sections of the compacted output. Disable irrelevant files to save more tokens.
- **Flowchart Visualization** — Interactive dependency graph rendered from compacted output. Shows how components connect through imports with expandable nodes.

### Templates & File Groups

- **Prompt Templates** — Create, edit, and select reusable prompt templates. Ships with defaults. Toggle with `Alt+Alt` (double-tap).
- **File Groups** — Save named sets of selected files per project. Load a group to instantly restore a file selection context you use often.

### Bookmarks & Workspaces

- **Bookmarks** — Save project paths as bookmarks. Access via palette (`Ctrl+P`), dropdown, or sidebar section. Navigate between projects instantly.
- **Multi-Project Workspaces** — Group multiple projects into a workspace. Uses symlinks to create a unified directory structure. Open a workspace to see all projects in one sidebar.

### Git Integration

- **Git Stats Badges** — Real-time added/modified/deleted indicators on files in the tree, powered by `git status`.
- **Git Diff Viewer** — Side-by-side diff dialog with word-level highlighting, a minimap, line selection, collapsed unchanged regions, and virtualized scrolling for large diffs.
- **Auto Commit** — Automatically stage and commit changes via your CLI agent with a configurable commit prompt.
- **Auto Changelog** — Generates changelog entries automatically on commit triggers using your CLI agent.
- **Branch Name Display** — Shows the current git branch in the status bar.
- **Branch Tasks** — Tracks completed tasks per branch. View history in a dialog to see what was done on each branch.

### Token Budget & Analytics

- **Token Usage Tracking** — Monitors input, output, and cache token usage per session by reading Claude's session files.
- **Token Budget Limits** — Set daily and weekly token limits. An alert banner appears when you're approaching or over budget.
- **Token Dashboard** — Full analytics view with:
  - Line charts for usage over time (daily/weekly/monthly)
  - Model breakdown pie chart
  - Calendar heatmap of daily usage
  - Session efficiency metrics
  - Historical session browser with search and filters
- **Project Comparison** — Compare token usage and costs across all your projects.
- **Export Reports** — Export usage data as CSV or JSON with date range filtering.

### Instance Sync

- **Instance Sync** — Discovers other Claude Code or opencode instances running on the same machine by scanning their session directories.
- **Instance Sync Panel** — Browse other instances' sessions, read their conversation history, and generate review or continuation prompts to load their context into your current session.

### UI & Theming

- **Theme System** — Multiple built-in themes with runtime switching. Persisted in localStorage.
- **Keyboard Shortcuts** — Comprehensive shortcut system. Press `Ctrl+H` to open the shortcuts dialog.
- **Splash Screen** — Animated project initialization screen with step indicators.
- **Toast Notifications** — Stackable notification system for success, error, warning, and info messages.
- **Sandbox Mode** — Toggle sandboxed terminal execution from the status bar.
- **Network Isolation** — Toggle network access for terminal sessions from the status bar.

## Development

```bash
npm run dev         # Start development server (Tauri + Vite hot reload)
npm run build       # Build frontend for production
npm run tauri:build # Build full Tauri application
npm run dev:vite    # Run Vite dev server only (frontend development)
npm run preview     # Preview production build
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Toggle Navigation Mode |
| `Ctrl+K` | Launch CLI / Toggle Context Mode |
| `Ctrl+P` | Open Projects Palette |
| `Ctrl+T` | Focus Textarea Panel |
| `Ctrl+Enter` | Send Textarea Content |
| `Ctrl+Ctrl` | Toggle Orchestration Mode (double-tap) |
| `Alt+Alt` | Open Template Selector / Clear Template (double-tap) |
| `Ctrl+F` | Focus File Search |
| `Ctrl+G` | Toggle Git Filter |
| `Ctrl+W` | Toggle File Watchers |
| `Ctrl+H` | Open Keyboard Shortcuts Dialog |

## Architecture

### Frontend

- **App.jsx** orchestrates the terminal and sidebar
- **useTerminal** hook manages the PTY lifecycle
- **useCwdMonitor** polls the backend to keep the sidebar in sync

**Dual-Mode Sidebar:**
- **Navigation Mode** (`Ctrl+S`): Flat directory view for quick navigation
- **Context Mode** (`Ctrl+K`): Hierarchical tree with file selection for AI context

### Backend (Rust/Tauri)

- **PTY Management**: Sessions stored in `AppState` with UUID identifiers
- **CWD Detection**: Linux-only via `/proc/[pid]/cwd` symlink resolution
- **Filesystem Operations**: Directory reading, file content, git stats

## Changelog

See the [CHANGELOG](./CHANGELOG.md) for release history and notable changes.

## License

[MIT](LICENSE)
