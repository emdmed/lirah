# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nevo Terminal is a terminal emulator built with Tauri 2, React 19, and xterm.js. It features a file browser sidebar with bidirectional synchronization between the sidebar navigation and terminal working directory.

## Development Commands

```bash
# Start development server (Tauri + Vite hot reload)
npm run dev

# Build production application
npm run build

# Run Vite dev server only (frontend development)
npm run dev:vite

# Preview production build
npm run preview
```

## Architecture

### Tech Stack
- **Frontend**: React 19 with Vite
- **Backend**: Rust with Tauri 2
- **Terminal**: xterm.js v5.5.0 with fit and web-links addons
- **PTY**: portable-pty crate for cross-platform pseudo-terminal support
- **UI**: Tailwind CSS 4 + shadcn/ui components (Radix UI primitives)
- **State**: React hooks + Tauri's managed state (Arc<Mutex<HashMap>>)

### Project Structure

```
src/                          # React frontend
├── App.jsx                   # Main app with sidebar + terminal orchestration
├── components/
│   ├── Terminal.jsx          # Terminal component wrapper
│   ├── Layout.jsx            # Layout with sidebar support
│   ├── FileTree.jsx          # Recursive tree view component for CLAUDE MODE
│   └── ui/                   # shadcn/ui components (sidebar, button, etc.)
├── hooks/
│   ├── useTerminal.js        # Terminal initialization, PTY spawning, I/O handling
│   └── useCwdMonitor.js      # Polls terminal CWD every 500ms for sidebar sync
└── themes/
    └── themes.js             # xterm.js color schemes (kanagawa, default)

src-tauri/src/                # Rust backend
├── lib.rs                    # Tauri app entry point, command handler registration
├── state.rs                  # AppState = Arc<Mutex<HashMap<sessionId, PtySession>>>
├── fs.rs                     # read_directory, get_terminal_cwd commands
└── pty/
    ├── mod.rs                # PTY module definition
    ├── manager.rs            # spawn_pty, write_to_pty, resize_pty functions
    └── commands.rs           # Tauri commands: spawn_terminal, write_to_terminal, etc.
```

### Key Architectural Patterns

#### Frontend-Backend Communication

**Tauri Commands** (React → Rust):
```javascript
import { invoke } from '@tauri-apps/api/core';

// Spawn terminal
const sessionId = await invoke('spawn_terminal', { rows: 24, cols: 80 });

// Send input to terminal
await invoke('write_to_terminal', { sessionId, data: 'ls\n' });

// Get terminal's current working directory (reads /proc/[pid]/cwd on Linux)
const cwd = await invoke('get_terminal_cwd', { sessionId });

// Read directory contents (returns array of {name, path, is_dir})
const entries = await invoke('read_directory', { path: '/home/user' });

// Resize terminal
await invoke('resize_terminal', { sessionId, rows: 30, cols: 100 });

// Close terminal session
await invoke('close_terminal', { sessionId });
```

**Tauri Events** (Rust → React):
```javascript
import { listen } from '@tauri-apps/api/event';

// Terminal output events
const unlisten = await listen('terminal-output', (event) => {
  const { session_id, data } = event.payload;
  terminal.write(data);  // xterm.js API
});
```

Rust emits terminal output via:
```rust
app.emit("terminal-output", TerminalOutputPayload { session_id, data });
```

#### PTY Session Management

- Each terminal has a UUID session ID
- `AppState` stores sessions in `Arc<Mutex<HashMap<String, PtySession>>>`
- `PtySession` contains: `master` (PTY), `child` (shell process), `writer` (stdin handle)
- Shell spawned as login shell (`-l` flag) with `$HOME` as CWD
- PTY reading happens in background thread, emits events to frontend

#### Dual-Mode Sidebar System

The sidebar has **two distinct modes** controlled by keyboard shortcuts:

1. **NAVIGATION MODE** (Ctrl+S) - Flat view:
   - Shows only current directory contents
   - Clicking folders navigates terminal to that directory
   - Designed for quick directory navigation
   - Files are displayed but not interactive

2. **CLAUDE MODE** (Ctrl+K) - Tree view:
   - Hierarchical expandable/collapsible folder tree
   - Lazy-loads folder contents on expansion
   - Files have "send to terminal" buttons (CornerDownRight icon)
   - Designed for AI assistants to send file paths to terminal
   - Clicking files sends their relative path to terminal input

Mode state tracked in `App.jsx`: `viewMode` ('flat' | 'tree')

#### Sidebar ↔ Terminal Synchronization

**Bidirectional sync architecture**:

1. **Sidebar → Terminal** (user clicks folder in flat mode):
   - `loadFolders(path)` called in App.jsx
   - Sends `cd 'path'\n` command via `write_to_terminal`
   - Waits 100ms for shell to process
   - Reads actual CWD via `get_terminal_cwd` (confirms navigation)
   - Updates sidebar to show confirmed directory

2. **Terminal → Sidebar** (user types `cd` in terminal):
   - `useCwdMonitor` hook polls `get_terminal_cwd` every 500ms
   - Detects CWD change
   - In flat mode: triggers `loadFolders()` to refresh sidebar
   - In tree mode: triggers `expandToPath()` to expand tree to new location

**Path escaping**: Sidebar wraps paths in single quotes with `'\''` escape for embedded quotes
```javascript
const safePath = `'${path.replace(/'/g, "'\\''")}'`;
const command = `cd ${safePath}\n`;
```

#### Tree View Implementation

- `FileTree.jsx` renders recursive tree structure
- Nodes have `children` property: `null` (not loaded), `undefined` (not a directory), or `array` (loaded)
- `expandedFolders` is a Set tracking which folder paths are expanded
- Lazy loading: children fetched via `read_directory` only when folder first expanded
- `expandToPath()` recursively expands all parent folders to reveal a deep path
- Relative path calculation in `getRelativePath()` for sending files to terminal

#### Terminal Lifecycle

1. `useTerminal` hook initializes xterm.js Terminal instance
2. Calls `spawn_terminal` Tauri command with rows/cols
3. Backend spawns PTY + shell process via portable-pty
4. Background thread reads PTY output, emits `terminal-output` events
5. Frontend listens to events, writes to xterm.js
6. User input via `terminal.onData()` → sent to backend via `write_to_terminal`
7. On unmount, frontend calls `close_terminal` to cleanup PTY session

## Working with Terminal Features

### Adding New Terminal Commands

1. Add Rust function in `src-tauri/src/pty/commands.rs`
2. Register in `src-tauri/src/lib.rs` invoke_handler
3. Call from React via `invoke('command_name', { params })`

### Modifying Sidebar Behavior

- Sidebar state lives in `App.jsx`: `folders`, `currentPath`, `sidebarOpen`, `viewMode`
- Toggle navigation mode: Ctrl+S (captured in `App.jsx` keydown listener)
- Toggle CLAUDE MODE: Ctrl+K (captured in `App.jsx` keydown listener)
- Flat mode folder navigation logic in `loadFolders()` function
- Tree mode expansion logic in `toggleFolder()` and `expandToPath()`
- Parent directory navigation in `navigateToParent()`

### Theme Customization

- Themes defined in `src/themes/themes.js`
- Currently supports 'kanagawa' (default) and 'default' (emerald green monochrome)
- Theme saved to localStorage
- Applied to xterm.js via `terminal.options.theme = theme`

## Important Implementation Notes

### CWD Detection Mechanism

`get_terminal_cwd` reads `/proc/[pid]/cwd` symlink on Linux to get shell's actual working directory. This is:
- **Platform-specific**: Linux only (uses procfs)
- **Process-based**: Reads from shell child process, not PTY
- **Non-blocking**: Returns immediately, doesn't affect terminal I/O

### Shell Configuration

- Unix: Uses `/bin/bash` as login shell (`-l` flag)
- Windows: Uses `$COMSPEC` or `powershell.exe`
- Starts in `$HOME` directory
- Login shell sources `.bash_profile`, `.profile`, etc.

### xterm.js Integration

- Terminal uses FitAddon for auto-sizing to container
- WebLinksAddon enables clickable URLs in terminal output
- Font: "Source Code Pro" with fallbacks
- Cursor blink enabled, 14px font size
- Terminal disposal on component unmount prevents memory leaks

### Sidebar UI Components

Uses shadcn/ui components (Radix UI primitives):
- `SidebarProvider` - manages open/close state
- `Sidebar`, `SidebarContent`, `SidebarGroup` - layout structure
- `SidebarMenuButton` - clickable folder/file items
- `Badge` - shows current mode (NAVIGATION MODE / CLAUDE MODE)
- Folder icon: `lucide-react` Folder component (golden color #E6C384)
- File icon: `lucide-react` File component
- Parent nav: ChevronUp icon button

### File Path Handling for AI Assistants

When in CLAUDE MODE (tree view):
- Files display a CornerDownRight icon button on hover
- Clicking sends **relative path** to terminal (not absolute)
- Path is shell-escaped and appends space (ready for command completion)
- Terminal auto-focuses after path insertion
- Relative path calculation handles special cases (same dir = '.', parent dirs, etc.)

## Debugging

- Frontend logs: Browser DevTools console (in Tauri webview)
- Backend logs: Terminal running `npm run dev` (Rust stdout/stderr)
- Terminal output events: Check `console.log` in `terminal-output` listener
- PTY issues: Check portable-pty errors in Rust logs
- CWD sync: Watch `useCwdMonitor` console logs for detected changes
