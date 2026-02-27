# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lirah is a GUI for running Claude Code, built with Tauri 2, React 19, and xterm.js. It wraps the terminal with a file browser sidebar that stays synchronized with the working directory.

**Key Features**:
- **Prompt Textarea**: Write multi-line prompts and send them directly to Claude Code running in the embedded terminal
- **File Context Selection**: Select files from the filetree and mark them as "modify", "do not modify", or "use as example" to provide structured context to Claude
- **Smart Token Optimization**: Intelligently parses JavaScript and TypeScript files to minimize token usage - small files send just paths, medium files send function signatures, large files send skeleton overviews
- **Prompt Templates**: Save frequently used partial prompts for reuse across sessions
- **Bidirectional Sync**: Sidebar updates when you `cd` in terminal; clicking folders navigates the terminal
- **claude-orchestration Integration**: Includes workflow templates for common tasks (feature, bugfix, refactor, performance, review, pr, docs) with React-specific variants
- **Instance Sync**: Share work context between multiple running Lirah instances - see what other instances are working on and sync to their projects

## Development Commands

```bash
npm run dev         # Start development server (Tauri + Vite hot reload)
npm run build       # Build frontend for production
npm run tauri:build # Build full Tauri application
npm run dev:vite    # Run Vite dev server only (frontend development)
npm run preview     # Preview production build
```

## Architecture

### Frontend (React + xterm.js)

**Core Flow**: `App.jsx` orchestrates the terminal and sidebar. The `useTerminal` hook manages the PTY lifecycle (spawn → I/O → cleanup), while `useCwdMonitor` polls the backend every 500ms to keep the sidebar in sync with the terminal's working directory.

**Dual-Mode Sidebar**:
- **Navigation Mode** (Ctrl+S): Flat directory view; clicking folders sends `cd` to terminal
- **Claude Mode** (Ctrl+K): Hierarchical tree with file selection for AI context gathering

**State Management**: All state lives in `App.jsx` via hooks—no external state library. Key state groups:
- Sidebar: `folders`, `currentPath`, `viewMode`
- Textarea panel: `textareaVisible`, `textareaContent`, `selectedFiles`
- Git filter: `showGitChangesOnly`

### Backend (Rust/Tauri)

**PTY Management**: Sessions stored in `AppState` (`Arc<Mutex<HashMap<String, PtySession>>>`). Each session has a UUID and contains the PTY master, child process, and stdin writer.

**Key Modules**:
- `pty/commands.rs`: Tauri commands (`spawn_terminal`, `write_to_terminal`, `resize_terminal`, `close_terminal`, `get_terminal_cwd`)
- `fs.rs`: Filesystem operations (`read_directory`, `read_directory_recursive`, `read_file_content`, `get_git_stats`)
- `instance_sync/`: Inter-instance communication (register, update state, watch other instances)

**CWD Detection**: Linux-only via `/proc/[pid]/cwd` symlink resolution.

**Instance Sync**: Each Lirah instance writes its state to `~/.lirah/instances/[instance-id].json`. Other instances poll this directory every 2 seconds to discover peers. Status includes project path, active files, Claude session ID, and last updated timestamp. Stale instances (>1 hour) are automatically filtered out.

### Frontend ↔ Backend Communication

```javascript
// Commands (invoke)
const sessionId = await invoke('spawn_terminal', { rows, cols });
await invoke('write_to_terminal', { sessionId, data });
const cwd = await invoke('get_terminal_cwd', { sessionId });

// Events (listen)
await listen('terminal-output', ({ payload }) => terminal.write(payload.data));
```

## Adding New Tauri Commands

1. Add function in `src-tauri/src/pty/commands.rs` or `fs.rs`
2. Register in `src-tauri/src/lib.rs` invoke_handler
3. Call from React via `invoke('command_name', { params })`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Toggle Navigation Mode |
| Ctrl+K | Launch CLI / Toggle Claude Mode |
| Ctrl+P | Open Projects Palette |
| Ctrl+T | Focus Textarea Panel |
| Ctrl+Enter | Send Textarea Content |
| Ctrl+Shift+Z | Restore Last Prompt (when textarea empty) |
| Ctrl+Shift+P | Compact Whole Project |
| Ctrl+Ctrl | Toggle Orchestration Mode (double-tap) |
| Alt+Alt | Open Template Selector / Clear Template (double-tap) |
| Ctrl+F | Focus File Search |
| Ctrl+G | Toggle Git Filter |
| Ctrl+W | Toggle File Watchers |
| Ctrl+Shift+I | Toggle Instance Sync Panel |
| Ctrl+H | Open Keyboard Shortcuts Dialog |

## Debugging

- **Frontend**: Browser DevTools console in Tauri webview
- **Backend**: Terminal running `npm run dev` shows Rust stdout/stderr
- **CWD sync issues**: Check `useCwdMonitor` console logs

## Workflows (claude-orchestration)

The `.claude/` directory contains workflow templates scaffolded by `npx claude-orchestration`. These provide structured guidance for common tasks:

| Workflow | Use When |
|----------|----------|
| `feature.md` | Building new functionality |
| `bugfix.md` | Diagnosing and fixing bugs |
| `refactor.md` | Improving code without behavior changes |
| `performance.md` | Profiling and optimizing |
| `review.md` | Reviewing code for merge |
| `pr.md` | Generating PR title and description |
| `docs.md` | Writing documentation |

React projects use `workflows/react/` variants with React-specific best practices. See `.claude/orchestration.md` for workflow selection guidance.
