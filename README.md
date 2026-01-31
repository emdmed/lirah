# Lirah

A native desktop app for Claude Code. Keep your files, prompts, and terminal perfectly in sync—so you can focus on shipping, not wrangling context.

Built with **Tauri 2** | **React 19** | **xterm.js** | **TypeScript**

## Why Lirah?

| | |
|---|---|
| **Native & Fast** | Lightweight Tauri app, not an Electron behemoth |
| **Better Output** | Structured context = better Claude results |
| **Real Workflows** | Designed for actual development, not demos |
| **Terminal-First** | Terminal-first, not terminal-hostile |

If you use Claude Code seriously, Lirah becomes the place you run it.

## Features

### File Context Selection

Claude is only as good as the context you give it. Lirah makes that effortless.

- Select files directly from your project tree
- Tell Claude exactly how to use each file:
  - **Modify** — Files Claude should change
  - **Do not modify** — Reference only, keep unchanged
  - **Use as example** — Patterns for Claude to follow

No more copy-pasting paths or guessing what the model "saw". Your intent is explicit. Your results are better.

### Prompt Editor

Stop typing prompts one line at a time in a terminal.

- Multi-line textarea for complex instructions
- Send prompts straight into Claude Code
- Save and reuse prompt templates across sessions

Write once. Reuse forever.

### Bidirectional Sync

Lirah keeps your UI and terminal aligned at all times.

- `cd` in the terminal → sidebar updates instantly
- Click a folder in the sidebar → terminal navigates there

Always know where you are, without thinking about it.

### Built-In Claude Workflows

Ships with [claude-orchestration](https://github.com/anthropics/claude-orchestration) integrations out of the box. Start strong instead of from scratch.

| Workflow | Use Case |
|----------|----------|
| Feature | New feature development |
| Bugfix | Debug and fix issues |
| Refactor | Code restructuring |
| Performance | Speed optimizations |
| Review | Code review assistance |
| Pull Request | PR preparation |
| Documentation | Docs generation |
| React | React-specific variants |

## Installation

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18+)
- [Claude Code](https://claude.ai/code) CLI installed

### Build from Source

```bash
git clone https://github.com/emdmed/lirah.git
cd lirah
npm install
npm run tauri:build
```

The built application will be in `src-tauri/target/release/`.

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
| `Ctrl+K` | Launch CLI / Toggle Claude Mode |
| `Ctrl+P` | Open Projects Palette |
| `Ctrl+T` | Focus Textarea Panel |
| `Ctrl+Enter` | Send Textarea Content |
| `Ctrl+Ctrl` | Toggle Orchestration Mode (double-tap) |
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
- **Claude Mode** (`Ctrl+K`): Hierarchical tree with file selection for AI context

### Backend (Rust/Tauri)

- **PTY Management**: Sessions stored in `AppState` with UUID identifiers
- **CWD Detection**: Linux-only via `/proc/[pid]/cwd` symlink resolution
- **Filesystem Operations**: Directory reading, file content, git stats

## License

[MIT](LICENSE)
