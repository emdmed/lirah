# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

ao-terminal is a terminal emulator built with Tauri 2, React 19, and xterm.js. It features a file browser sidebar with bidirectional synchronization between the sidebar navigation and terminal working directory.

## Development Commands

```bash
npm run dev        # Start development server (Tauri + Vite hot reload)
npm run build      # Build production application
npm run dev:vite   # Run Vite dev server only (frontend development)
npm run preview    # Preview production build
```

---

# Frontend (React)

## Tech Stack
- React 19 with Vite
- xterm.js v5.5.0 with fit and web-links addons
- Tailwind CSS 4 + shadcn/ui components (Radix UI primitives)
- State management via React hooks

## Directory Structure

```
src/
├── App.jsx                   # Main app with sidebar + terminal orchestration
├── components/
│   ├── Terminal.jsx          # Terminal component wrapper
│   ├── Layout.jsx            # Layout with sidebar support
│   ├── FileTree.jsx          # Recursive tree view component for CLAUDE MODE
│   ├── TextareaPanel.jsx     # Multi-line input panel component
│   ├── StatusBar.jsx         # Bottom status bar with keyboard shortcuts
│   ├── SidebarHeader.jsx     # Sidebar header with git filter toggle
│   ├── FlatViewMenu.jsx      # Flat view directory listing
│   ├── ThemeSwitcher.jsx     # Theme selection dropdown
│   └── ui/                   # shadcn/ui components (sidebar, button, etc.)
├── hooks/
│   ├── useTerminal.js        # Terminal initialization, PTY spawning, I/O handling
│   ├── useCwdMonitor.js      # Polls terminal CWD every 500ms for sidebar sync
│   ├── useFileSearch.js      # Fuzzy file search using js-search
│   ├── useFlatViewNavigation.js  # Flat view directory navigation logic
│   ├── useViewModeShortcuts.js   # Ctrl+S and Ctrl+K shortcuts
│   ├── useTextareaShortcuts.js   # Ctrl+T and Ctrl+Enter shortcuts
│   └── useHelpShortcut.js    # Ctrl+H shortcut
├── contexts/
│   ├── ThemeContext.jsx      # Theme management context
│   └── PromptTemplatesContext.jsx  # Prompt templates management
├── themes/
│   ├── theme-config.js       # Theme definitions (terminal + UI colors)
│   └── themes.js             # Backwards compatibility wrapper (deprecated)
└── utils/
    └── fileAnalyzer.js       # JavaScript/TypeScript AST analysis using Babel
```

## Key Components

### App.jsx
Main orchestrator managing:
- Sidebar state: `folders`, `currentPath`, `sidebarOpen`, `viewMode`
- Textarea state: `textareaVisible`, `textareaContent`, `selectedFiles`, `fileStates`
- Git filter state: `showGitChangesOnly`

### useTerminal.js Hook
Terminal lifecycle:
1. Initializes xterm.js Terminal instance
2. Calls `spawn_terminal` Tauri command with rows/cols
3. Listens to `terminal-output` events from backend
4. Sends user input via `write_to_terminal`
5. Handles cleanup on unmount via `close_terminal`

### Dual-Mode Sidebar

**NAVIGATION MODE** (Ctrl+S) - Default:
- Flat view showing only current directory
- Clicking folders navigates terminal to that directory

**CLAUDE MODE** (Ctrl+K):
- Hierarchical expandable tree view
- Files have "send to terminal" buttons
- Designed for AI assistants

### Sidebar ↔ Terminal Sync

**Sidebar → Terminal**: `loadFolders(path)` sends `cd` command, waits 100ms, confirms via `get_terminal_cwd`

**Terminal → Sidebar**: `useCwdMonitor` polls `get_terminal_cwd` every 500ms, updates sidebar on change

### Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| Ctrl+S | Toggle Navigation Mode |
| Ctrl+K | Toggle Claude Mode |
| Ctrl+T | Focus Textarea Panel |
| Ctrl+Enter | Send Textarea Content |
| Ctrl+F | Focus File Search |
| Ctrl+G | Toggle Git Filter |
| Ctrl+H | Toggle Help Modal |

### Calling Backend Commands

```javascript
import { invoke } from '@tauri-apps/api/core';

const sessionId = await invoke('spawn_terminal', { rows: 24, cols: 80 });
await invoke('write_to_terminal', { sessionId, data: 'ls\n' });
const cwd = await invoke('get_terminal_cwd', { sessionId });
const entries = await invoke('read_directory', { path: '/home/user' });
const tree = await invoke('read_directory_recursive', { path: '/home/user', maxDepth: 10, maxFiles: 10000 });
const content = await invoke('read_file_content', { path: '/path/to/file' });
const gitStats = await invoke('get_git_stats', { path: '/home/user' });
await invoke('resize_terminal', { sessionId, rows: 30, cols: 100 });
await invoke('close_terminal', { sessionId });
```

### Listening to Backend Events

```javascript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen('terminal-output', (event) => {
  const { session_id, data } = event.payload;
  terminal.write(data);
});
```

---

# Backend (Rust/Tauri)

## Tech Stack
- Rust with Tauri 2
- portable-pty crate for cross-platform PTY support
- Tauri managed state: `Arc<Mutex<HashMap>>`

## Directory Structure

```
src-tauri/src/
├── lib.rs          # Tauri app entry point, command handler registration
├── state.rs        # AppState = Arc<Mutex<HashMap<sessionId, PtySession>>>
├── fs.rs           # Directory/file reading, git stats, CWD detection
└── pty/
    ├── mod.rs      # PTY module definition
    ├── manager.rs  # spawn_pty, write_to_pty, resize_pty functions
    └── commands.rs # Tauri commands: spawn_terminal, write_to_terminal, etc.
```

## PTY Session Management

### state.rs
- `AppState` stores sessions in `Arc<Mutex<HashMap<String, PtySession>>>`
- Each terminal has a UUID session ID
- `PtySession` contains: `master` (PTY), `child` (shell process), `writer` (stdin handle)

### pty/manager.rs
- `spawn_pty()`: Creates PTY + shell process
- `write_to_pty()`: Sends input to PTY stdin
- `resize_pty()`: Resizes PTY dimensions

### pty/commands.rs
Tauri commands exposed to frontend:
- `spawn_terminal`: Creates new PTY session, returns session_id
- `write_to_terminal`: Writes data to PTY
- `resize_terminal`: Resizes PTY
- `close_terminal`: Cleans up PTY session
- `get_terminal_cwd`: Reads `/proc/[pid]/cwd` to get shell's CWD (Linux only)

### Shell Configuration
- Unix: `/bin/bash` as login shell (`-l` flag)
- Windows: `$COMSPEC` or `powershell.exe`
- Starts in `$HOME` directory

## Filesystem Commands (fs.rs)

- `read_directory`: Returns `Vec<{name, path, is_dir}>`
- `read_directory_recursive`: Returns flat array with `depth` and `parent_path`
  - Ignores: `.git`, `node_modules`, `target`, `dist`, `build`, `.cache`, `.next`, `.nuxt`, `__pycache__`, `.venv`, `venv`
  - Skips symlinks
  - Max depth: 10, max files: 10000
- `read_file_content`: Returns file content as string
- `get_git_stats`: Runs `git diff HEAD --numstat`, returns `HashMap<path, {added, deleted}>`

## Emitting Events to Frontend

```rust
app.emit("terminal-output", TerminalOutputPayload { session_id, data });
```

PTY output is read in a background thread and emitted to frontend.

## Adding New Commands

1. Add Rust function in `src-tauri/src/pty/commands.rs` or `fs.rs`
2. Register in `src-tauri/src/lib.rs` invoke_handler
3. Call from React via `invoke('command_name', { params })`

---

## Debugging

- **Frontend logs**: Browser DevTools console (in Tauri webview)
- **Backend logs**: Terminal running `npm run dev` (Rust stdout/stderr)
- **PTY issues**: Check portable-pty errors in Rust logs
- **CWD sync**: Watch `useCwdMonitor` console logs

## Orchestration

For complex tasks, refer to `.claude/orchestration.md` for available workflows.
