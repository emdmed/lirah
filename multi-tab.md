# Multi-Tab Architecture Plan

## Current Architecture (Single-Project)

The app is deeply wired around a single active project:

- **One `currentPath`** — `useFlatViewNavigation` returns a single `currentPath` that flows into ~20+ hooks (`useGitStats`, `usePatterns`, `useAutoChangelog`, `useCompact`, `useAgentOverlay`, `useInstanceSync`, etc.)
- **One terminal session** — `terminalSessionId` in `App.jsx` drives a single `Terminal` + one `SecondaryTerminal`
- **Global state is flat** — `AppStateData` (Rust) holds a `HashMap<String, PtySession>` keyed by UUID, but the frontend only ever creates one primary session
- **Single fs watcher** — `start_fs_watcher` watches one directory, emits `fs-changes` globally
- **Single sidebar** — file tree, git stats, file selection all operate on `currentPath`
- **All hooks take `currentPath` directly** — no indirection layer for "which tab am I in"

## Changes Needed

### 1. Frontend: Tab State Container

Create a `TabContext` / `useTabManager` that holds an array of tab descriptors:

```
Tab { id, projectPath, terminalSessionId, secondarySessionId }
```

The `activeTabId` determines which tab's state is rendered. Each tab owns its own:
- `currentPath` / `folders` (from `useFlatViewNavigation`)
- `terminalSessionId`
- `fileSelection` (selected files, file states)
- `textareaContent`, `compactedProject`, `selectedPatterns`
- `viewMode`, `searchQuery`, sidebar expansion state

**This is the hardest change.** Right now `App.jsx` has ~30 `useState` calls and ~25 hooks all sharing one implicit "project context." Options:
- **(A)** Extract per-tab state into a `useTabState(tabId)` hook that returns everything a tab needs, and make `App.jsx` just render the active tab's state
- **(B)** Move to a `TabPanel` component where each tab is a full subtree (simpler isolation, but more memory since all tabs stay mounted)

Option B is simpler and more robust — mount each tab as an independent component tree and just `display: none` the inactive ones. This avoids the massive refactor of pulling apart the 30+ hooks.

### 2. Frontend: Per-Tab Hooks Isolation

These hooks currently take `currentPath` as a direct parameter and would need per-tab instances:

| Hook | Currently | Change |
|------|-----------|--------|
| `useFlatViewNavigation` | single `currentPath` | one per tab |
| `useTreeView` | single tree state | one per tab |
| `useGitStats` | watches one path | one per tab |
| `usePatterns` | loads patterns for one path | one per tab |
| `useAutoChangelog` | watches one project | one per tab |
| `useAutoCommit` | global | shared or per-tab |
| `useBranchName` | one repo | one per tab |
| `useBranchTasks` | one branch | one per tab |
| `useCompact` | one project | one per tab |
| `useAgentOverlay` | one project | one per tab |
| `useTokenUsage` | one project | one per tab |
| `useFileSelection` | one set of files | one per tab |
| `useFileSymbols` | one file's symbols | one per tab |
| `useInstanceSync` | one project | one per tab |

Hooks that can remain global: `useTheme`, `useWatcher`, `useBookmarks`, `usePromptTemplates`, `useTerminalSettings`, `useToast`, `useUpdateChecker`.

### 3. Backend: Per-Tab FS Watcher

`start_fs_watcher` currently watches one directory. Changes needed:
- Accept a `tab_id` parameter and maintain multiple watchers in `FsWatcherStore`
- Emit events tagged with the watched path so the frontend routes them to the correct tab
- `stop_fs_watcher` would take `tab_id` to stop only that tab's watcher
- `FsChangesPayload` should include a `root_path` field so the frontend knows which tab it belongs to

### 4. Backend: Git Stats / Cache Scoping

`GitStatsCache` and `DirectoryCache` in `AppStateData` are currently single-instance. They'd need to be keyed by project path (e.g., `HashMap<String, GitStatsCache>`), or verify they already key internally by path.

### 5. Backend: PTY Sessions (Already Fine)

`pty_sessions: HashMap<String, PtySession>` already supports multiple sessions keyed by UUID. The terminal event emitter already tags output with `session_id`. **No backend PTY changes needed** — this is already multi-project-ready.

### 6. Frontend: Tab Bar UI

A `TabBar` component that renders tab labels (project name / directory basename), supports:
- Click to switch, middle-click/X to close
- Drag to reorder
- Keyboard shortcut (Ctrl+Tab / Ctrl+1-9)
- Visual indicator for active tab, git-dirty state per tab

### 7. Frontend: Terminal Event Routing

Terminal output events (`pty-output-{session_id}`) are already session-scoped. The `Terminal` xterm.js instance per tab just listens to its own session ID. **This already works.**

### 8. State Persistence

If tabs should survive restart:
- Store active tabs (paths + layout) in localStorage or a Tauri store
- Restore PTY sessions on launch (or just re-create terminals)

## Recommended Approach

**Option B (independent component trees per tab)** is the pragmatic path:

1. Create a `TabManager` context with `tabs[]`, `activeTabId`, `addTab()`, `removeTab()`, `switchTab()`
2. Create a `ProjectTab` component that contains everything currently in `App.jsx` below the tab bar — terminal, sidebar, textarea, status bar, all hooks
3. Render `ProjectTab` for each tab, hide inactive ones with CSS (`display: none` keeps xterm.js alive)
4. `App.jsx` becomes thin: just tab bar + renders `<ProjectTab>` per tab
5. Backend: add `root_path` to `FsChangesPayload`, parameterize `start_fs_watcher` per tab

**Main risk**: Memory. Each tab mounts a full xterm.js instance + all hooks with their intervals/listeners. For 3-5 tabs this is fine; for 20+ you'd want virtualization (unmount inactive tabs, restore on switch).
