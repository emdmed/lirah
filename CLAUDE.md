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
│   └── ThemeContext.jsx      # Theme management context
├── themes/
│   ├── theme-config.js       # Theme definitions (terminal + UI colors)
│   └── themes.js             # Backwards compatibility wrapper (deprecated)
└── utils/
    └── fileAnalyzer.js       # JavaScript/TypeScript AST analysis using Babel

src-tauri/src/                # Rust backend
├── lib.rs                    # Tauri app entry point, command handler registration
├── state.rs                  # AppState = Arc<Mutex<HashMap<sessionId, PtySession>>>
├── fs.rs                     # Directory/file reading, git stats, CWD detection
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

// Read directory recursively for tree view (returns array with depth and parent_path)
const tree = await invoke('read_directory_recursive', {
  path: '/home/user',
  maxDepth: 10,      // optional, default 10
  maxFiles: 10000    // optional, default 10000
});

// Read file content
const content = await invoke('read_file_content', { path: '/path/to/file' });

// Get git stats for directory (returns HashMap<path, {added, deleted}>)
const gitStats = await invoke('get_git_stats', { path: '/home/user' });

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

The sidebar has **two distinct modes** controlled by keyboard shortcuts. The sidebar is **open by default** in Navigation Mode:

1. **NAVIGATION MODE** (Ctrl+S) - Flat view [DEFAULT]:
   - Shows only current directory contents
   - Clicking folders navigates terminal to that directory
   - Designed for quick directory navigation
   - Files are displayed but not interactive
   - This is the default mode when the app starts

2. **CLAUDE MODE** (Ctrl+K) - Tree view:
   - Hierarchical expandable/collapsible folder tree
   - Lazy-loads folder contents on expansion
   - Files have "send to terminal" buttons (CornerDownRight icon)
   - Designed for AI assistants to send file paths to terminal
   - Clicking files sends their relative path to terminal input

Mode state tracked in `App.jsx`: `viewMode` ('flat' | 'tree')
Initial states: `sidebarOpen: true`, `viewMode: 'flat'`

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

**Tree Loading**:
- Initial tree load uses `read_directory_recursive` to fetch entire directory tree at once
- Ignores common build/cache directories: `.git`, `node_modules`, `target`, `dist`, `build`, `.cache`, `.next`, `.nuxt`, `__pycache__`, `.venv`, `venv`
- Returns flat array with `depth` and `parent_path` for each entry
- Frontend builds hierarchical tree using `buildTreeFromFlatList()` in App.jsx
- Skips symlinks to prevent infinite loops
- Max depth (10) and max files (10000) limits prevent performance issues

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

- Themes defined in `src/themes/theme-config.js`
- Currently supports 'kanagawa' (default dark), 'light', and 'default' themes
- Each theme contains both terminal colors (xterm.js) and UI colors (Tailwind CSS variables)
- Theme managed via `ThemeContext` (React Context API)
- Theme saved to localStorage via `saveTheme()` in theme-config.js
- Applied to xterm.js via `terminal.options.theme = theme.terminal`
- Applied to UI via CSS variables injected into `:root`
- Theme switching: use `ThemeContext.changeTheme(themeName)`

### Keyboard Shortcuts

All keyboard shortcuts use Ctrl key and capture phase to intercept before terminal:

| Shortcut | Function | Details |
|----------|----------|---------|
| **Ctrl+S** | Toggle Navigation Mode | Opens flat directory view for quick navigation |
| **Ctrl+K** | Toggle Claude Mode | Opens tree view for file exploration and AI interaction |
| **Ctrl+T** | Focus Textarea Panel | Focuses the multi-line input panel (visible by default) |
| **Ctrl+Enter** | Send Textarea Content | Sends textarea content to terminal (only when textarea focused) |
| **Ctrl+F** | Focus File Search | Focuses search input in tree mode (Cmd+F on Mac) |
| **Ctrl+G** | Toggle Git Filter | Shows only files with uncommitted git changes (Cmd+G on Mac) |
| **Ctrl+H** | Toggle Help Modal | Shows keyboard shortcuts reference |

Implemented in separate hooks:
- `useViewModeShortcuts.js` - Ctrl+S, Ctrl+K
- `useTextareaShortcuts.js` - Ctrl+T, Ctrl+Enter
- `useHelpShortcut.js` - Ctrl+H
- `useTerminal.js` - Ctrl+F, Ctrl+G (intercepts and calls callbacks)

### Textarea Panel Feature

Multi-line input panel for composing complex commands or prompts before sending to terminal. The panel is **visible by default** at the bottom of the terminal.

**Architecture**:
- `TextareaPanel.jsx` - Panel component rendered at bottom of terminal
- `useTextareaShortcuts.js` - Handles Ctrl+T (focus) and Ctrl+Enter (send) keyboard shortcuts
- State managed in `App.jsx`: `textareaVisible` (default: `true`), `textareaContent`, `selectedFiles`, `fileStates`

**File Selection System**:
- Files can be selected from tree view (Plus icon button on hover)
- Selected files appear as badges in textarea panel
- Each file has a state: 'modify', 'do-not-modify', or 'use-as-example'
- Clicking badge cycles through states (visual color changes)
- Files are sent with their relative paths when Ctrl+Enter is pressed

**Usage Flow**:
1. Textarea panel is visible by default at the bottom
2. Press Ctrl+T to focus the textarea (if not already focused)
3. Type multi-line command or prompt
4. Optionally select files from tree view (Plus icon)
5. Press Ctrl+Enter to send content to terminal
6. Text content and selected files cleared after sending (files optional based on setting)

### File Search Feature

Fuzzy search for finding files in tree view using js-search library.

**Implementation**:
- `useFileSearch.js` - Hook providing search index initialization and search
- Uses `AllSubstringsIndexStrategy` for fuzzy matching
- Uses `TfIdfSearchIndex` for relevance ranking
- Searches both file name and full path
- Case-insensitive search via `LowerCaseSanitizer`

**Usage**:
- Ctrl+F focuses search input when tree view is open
- Search results filter the tree in real-time
- Search index built from flat file list when tree is loaded
- Clearing search restores full tree view

**Functions**:
```javascript
const { initializeSearch, search, clearSearch } = useFileSearch();

// Build index when tree loads
initializeSearch(flatFileList);

// Search for files
const results = search(query); // Returns matching file entries

// Clear index
clearSearch();
```

### Git Integration

Displays uncommitted changes and provides git-based filtering.

**Git Stats Feature**:
- `get_git_stats` Tauri command in `fs.rs`
- Runs `git diff HEAD --numstat` to get line changes
- Returns HashMap of file paths to `GitStats { added, deleted }`
- FileTree component fetches git stats every 5 seconds
- Files with changes show colored badges with +/- line counts

**Git Filter (Ctrl+G)**:
- Filters tree view to show only files with uncommitted changes
- Recursively filters directories (shows dir if any child has changes)
- Implemented in `FileTree.jsx` via `filterTreeByGitChanges()`
- Toggle button in sidebar header (Filter icon)
- State tracked in `App.jsx`: `showGitChangesOnly`

### File Analysis Feature

Analyzes JavaScript/TypeScript files to extract hooks, components, and functions.

**Implementation**:
- `utils/fileAnalyzer.js` - Uses Babel parser and traverse
- Parses JS/JSX/TS/TSX files into AST
- Extracts:
  - React hooks (any function call starting with "use")
  - React components (function components with JSX, class components extending Component)
  - Used components (JSX elements in the file)
  - Regular functions (non-component, non-hook functions)

**Usage in UI**:
- Available in tree view (beaker icon on JS/JSX files)
- Click to analyze file (async operation)
- Results cached in `analyzedFiles` Map
- Expandable sections show extracted items
- Each item has "send to terminal" button (sends item name to terminal)

**Functions**:
```javascript
import { analyzeJSFile } from './utils/fileAnalyzer';

const result = analyzeJSFile(code, filePath);
// Returns: { hooks: Set, definedComponents: Set, usedComponents: Set, functions: Set }
```

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


## Orchestration

For complex tasks, refer to .claude/orchestration.md for available workflows.
