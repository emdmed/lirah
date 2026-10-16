# Smooth Improvements Plan: Performance & Responsiveness

> Scope: full audit of the Rust/Tauri backend (`src-tauri/`) and the React 19 frontend (`src/`) of Lirah v0.3.23.
> Date: 2026-10-15. Baseline commit: `cc6eab9`.
> Method: static analysis of every hot path, plus a production build with sourcemap attribution of the main bundle. All `file:line` references are against `cc6eab9`.

---

## 0. Executive summary

The app's jank comes from **five root causes**. Most visible stutter traces back to one of them:

| # | Root cause | Felt as |
|---|-----------|---------|
| A | **Synchronous Tauri commands run on the main (GTK/WebKit) thread.** That includes PTY writes, git subprocesses, `tsc`, transcript parsing and directory walks. PTY commands also hold one global `Mutex<AppStateData>`. | Keystroke lag, UI freezes of 50 ms to many seconds, typing stalls while Claude launches. |
| B | **Unmemoized hook/context values cascade re-renders.** `useDialogs`, `AgentJobsContext` and `ToastContext` return new objects every render, which defeats every `memo` downstream, including the recursive file tree. | Every prompt keystroke, every agent-output batch and every toast re-renders whole tabs (inactive ones too) and the entire visible file tree. |
| C | **Polling instead of events, never paused.** Examples: branch name at 2 Hz (duplicated), subagent transcripts every 10 s with full re-parse, child-process scans every 300 ms. | Constant background CPU, periodic hitches, battery drain. |
| D | **No backpressure on terminal output, and per-tab costs are multiplied.** Every tab spawns a PTY and a WebGL context at boot, and hidden tabs still refit/SIGWINCH on resize. | Freezes on `cat bigfile`, slow startup with many tabs, lost WebGL contexts. |
| E | **A single 2.7 MB JS chunk.** Babel (792 KB), recharts (340 KB) and markdown (155 KB) all load at boot. | Slow cold start: parse/compile on WebKitGTK before first paint. |

Fixing the **Phase 1 quick wins** (about one or two days) removes most user-visible jank. Phases 2–5 make it structurally smooth.

There is also one **latent crash bug** (not perf): `useCallback` is called inside conditional JSX at `src/features/tabs/ProjectTab.jsx:835`. Toggling the sidebar changes the hook count. It is fixed in Phase 1.

---

## 1. Targets & how we measure

The perf workflow rule applies: **measure before and after every phase**. Never add `memo`/`useMemo` "just in case".

### Target metrics

| Metric | How to measure | Target |
|---|---|---|
| Keystroke → echo latency (terminal) | `performance.now()` in `onData` → matching `terminal-output` write callback, logged p50/p95 in dev | p95 < 16 ms (currently ≥ 8 ms floor + main-thread contention) |
| Prompt textarea keystroke cost | React DevTools Profiler, commit duration while typing with 1 k-node tree expanded | < 4 ms per commit, only `TextareaPanel` subtree commits |
| Agent output batch cost | Profiler with a job streaming output, 3 tabs open | Only RightSidebar commits, no ProjectTab commits |
| Throughput | `time cat 50MB.txt` / `yes \| head -n 2000000` in terminal | UI stays responsive (input accepted < 50 ms), no data loss |
| Cold start → first terminal prompt | `performance.mark` at `main.jsx` start and at first PTY output; Tauri log timestamps | −40 % vs baseline |
| Initial JS | `vite build` output | ≤ 1.2 MB main chunk (from 2.73 MB) |
| Idle CPU (1 tab, nothing running) | `pidstat -p <pid> 5` on the lirah + WebKitWebProcess PIDs | < 1 % |
| Main-thread blocking IPC | Temporary Rust timing wrapper logging any command > 16 ms | Zero sync commands > 16 ms |

### Tasks
- [ ] **0.1** Add a dev-only `perf` util (`src/lib/perf.js`) with `mark/measure` helpers. Add an env-flag `LIRAH_TRACE_IPC=1` that makes Rust log command durations through a small macro or wrapper.
- [ ] **0.2** Record a baseline for every metric above in `docs/perf-baseline.md` before any change.
- [ ] **0.3** Create a repeatable scenario: one large repo (≥ 10 k files), 3 tabs, 1 agent job streaming, sidebar expanded with the git filter on.

---

## 2. Phase 1: Quick wins (high impact, low risk, ~1–2 days)

Each item is small and independent. Ship them as separate commits.

### 1.1 Make every IO command async (root cause A)
- **What:** add `#[tauri::command(async)]`, or make the command `async fn` + `spawn_blocking`, to every command that does IO or spawns processes:
  - `fs/git.rs`: `get_git_stats:153`, `get_current_branch:227`, `get_git_diff`
  - `fs/directory.rs`: `read_directory:25`, `read_directory_recursive:108`
  - `fs/cwd.rs:20` `get_terminal_cwd`
  - `pty/commands.rs`: `run_git_command:504`, `check_pty_child_process:997`, `kill_pty_child_process:1052`, `spawn_terminal:126`, `resize_terminal:267`, `close_terminal:286`
  - `typecheck.rs:84` `check_file_types`, which can block **seconds per file**
  - `claude/commands.rs:866` `get_project_subagents`
  - `read_file_content` / `write_file_content`, `parse_python_skeleton`, `create_workspace` / `open_workspace`, `start_fs_watcher`
- **Why:** in Tauri 2, a plain `#[tauri::command] fn` runs on the main thread, which on Linux is the GTK/WebKit UI thread. `design/branch.rs:259-262` already documents this.
- **Caveat:** after a command goes async, check that none of them holds `std::sync::Mutex` guards across blocking work (see 2.1).
- **Accept:** the IPC trace shows no main-thread command > 16 ms.

### 1.2 Memoize `useDialogs` (root cause B, the single biggest render win)
- `src/hooks/useDialogs.js:26-48`: wrap the return in `useMemo`.
- Better: have the consumers `viewFileDiff` / `viewMarkdownFile` (`ProjectTab.jsx:401-410`) depend only on the stable setters (`dialogs.setDiffDialogOpen`, …), not on `dialogs`.
- This also stops the global keydown listener in `ProjectTab.jsx:651-717` from being re-subscribed every render, and stops `commands` (`:781-823`) from being recomputed.
- **Accept:** typing in the prompt does not commit any `TreeNode`.

### 1.3 Fix the conditional hook in ProjectTab (crash bug)
- `ProjectTab.jsx:835`: hoist `useCallback` for `onSearchChange` above the `return`. Do the same for the inline `useCallback`s around `:916-943`.

### 1.4 Stable callbacks into `Terminal`
- `ProjectTab.jsx:~975,~982`: pass `onReady`/`onSandboxFailed` through `useCallback`, so that `memo(Terminal)` actually holds and the `onReady` effect stops re-running.
- `ProjectTab.jsx:470`: stop passing an inline `clearSelectedTemplate` to `usePromptSender`, so `onSendContent` stops changing every render (which re-subscribes `useTextareaShortcuts`).
- Gate `useTextareaShortcuts` on `isActive`.

### 1.5 Replace branch-name polling with events (root cause C)
- `useBranchName.js:44` polls `get_current_branch` every 500 ms.
- `RightSidebar.jsx:92` calls it **ungated** (always 2 Hz, even with the window hidden), on top of the active tab's own poll.
- **Fix:** `fs_watcher.rs:236-241` already watches `.git/HEAD`. Emit `branch-changed { repo, branch }` from there and have `useBranchName` listen to it. Keep a 30 s fallback poll that is gated on `document.visibilityState === 'visible'`.
- Share one value via a small `BranchContext` (or pass it as a prop from ProjectTab to RightSidebar).

### 1.6 Pause all polls when the window is hidden
- Add `src/hooks/usePageVisible.js`, a `useSyncExternalStore` over `visibilitychange`, and gate these on it:
  - `SubagentContext.jsx:111` (10 s)
  - `useCwdMonitor.js:38` (500 ms)
  - `useGitStats.js:69` (30 s fallback)
  - `useTokenUsage` (5 s)
  - `AgentSidebar.jsx:169,238` (5 s unconditional tickers)
  - `useUpdateChecker`

### 1.7 Cheap child-process check (stalls during Claude launch)
- `pty/commands.rs:1016-1017, 1071-1072` call `System::new()` + `refresh_processes(All, true)`, a full `/proc` scan, **while holding the global state lock, on the main thread**.
- `ProjectTab.jsx:377-388` polls it every 300 ms for up to 15 s with `setInterval(async …)`, so calls can overlap.
- **Fix:**
  - Copy the PID, drop the lock, and walk `/proc/<pid>/task/*/children` (as `fs/cwd.rs:6` already does) on `spawn_blocking`.
  - On the frontend, replace `setInterval` with a `setTimeout` chain so calls never overlap.

### 1.8 Lazy-load heavy features (root cause E, about −55 % initial JS)
- **Babel (792 KB):**
  - `ProjectTab.jsx:23` → `file-analysis/index.js` barrel → `useFileSymbols.js:3-11` → `babelSymbolParser.js`.
  - Move `isBabelParseable` (a pure extension check, `babelSymbolParser.js:9`) into a tiny `babelSupport.js`.
  - `await import('./babelSymbolParser')` inside `extractFileSymbols` and in `useProjectCompact.js:3`.
  - Remove the barrel re-exports in `file-analysis/index.js:11-19`. Barrels also violate `.patterns/hooks.md` ("No barrel exports").
- **recharts (340 KB):** `DialogHost.jsx:12` imports `TokenDashboard` statically. Make it `React.lazy` + `Suspense`, rendered only while `dialogs.dashboardOpen`.
- **Markdown (155 KB) and other dialogs:** lazy-load and **mount only while open**:
  - DesignDialog (`TextareaPanel.jsx:3`)
  - MarkdownViewerDialog (`ProjectTab.jsx:16`, `RightSidebar.jsx:16`)
  - FlowchartDialog / CompactSectionsDialog (`TextareaPanel.jsx:2`)
  - RunJobDialog / RaceCompareDialog (`RightSidebar.jsx:18-19`)
  - GitDiffDialog
  - BranchCompletedTasksDialog
  - AutoCommit / AutoCommitConfig / AutoChangelog dialogs
  - ElementPickerDialog
  - OrchestrationDashboard
  - WorkspaceDialog
  - ManageTemplatesDialog
  - KeyboardShortcutsDialog
- Keep `BookmarksPalette`, `TokenAlertBanner` and the toasts eager, for hotkey latency.
- Mounting only while open also removes about 16 closed-dialog renders per ProjectTab render.
- **Accept:** main chunk ≤ 1.2 MB; opening each dialog still works (first open may show a ≤ 100 ms Suspense fallback).

### 1.9 Self-host the splash font
- `index.html:7-9` loads Grenze Gotisch from Google Fonts. That is **render-blocking**, and it breaks offline.
- Move the woff2 into `public/fonts` with `font-display: swap`, as is already done for Barlow.
- Convert Typestar OCR (`src/index.css:4-9`, a 22 KB `.otf` without `font-display`) to woff2 with `swap`.

### 1.10 Rust release profile
- `src-tauri/Cargo.toml` has no `[profile.release]`. Add:
  ```toml
  [profile.release]
  lto = true
  codegen-units = 1
  opt-level = 3
  strip = true
  panic = "abort"
  ```
- Expected: binary 30–50 % smaller (currently ~18 MB) and slightly faster startup.

---

## 3. Phase 2: Backend concurrency & IO (root causes A, C)

### 2.1 Per-session PTY handles, with no global lock on the hot path
- **Today:**
  - `write_to_terminal` takes the global `Arc<Mutex<AppStateData>>` (`state.rs:27`, `pty/commands.rs:250-264`) and does a blocking `write_all + flush` (`pty/manager.rs:207-217`).
  - A stalled child (for example a large paste into a busy TUI) blocks the UI and every other session.
- **Change:**
  - Store sessions as `HashMap<String, Arc<SessionHandle>>`, or a `DashMap`. Clone the `Arc` and release the map lock immediately.
  - Give each session a **dedicated writer thread** fed by an `mpsc::Sender<Vec<u8>>`. `write_to_terminal` becomes `async`, only does `tx.send(bytes)` (non-blocking), and keeps keystroke order.
  - `resize` / `close` take the per-session lock only.
  - `close_terminal`: `child.kill()` then `child.wait()` on a blocking thread, to reap zombies (`commands.rs:301`).
- **Accept:** a paste of 1 MB into `sleep 100` does not freeze the UI or other tabs.

### 2.2 `get_project_subagents`: incremental and cached
- **Today:** `claude/commands.rs:705-907` re-reads **every** `agent-*.jsonl` of every session from byte 0 into `serde_json::Value`. It runs every 10 s per project (`SubagentContext.jsx:111`) and on every `subagents-changed` event.
- **Change:**
  - Reuse the incremental offset cache pattern already present in `fs/tokens.rs:604-757`: key on (path, len, mtime) and parse only appended bytes.
  - Skip files with an mtime older than the frontend mount time. The frontend already discards those.
  - Parse with typed `#[derive(Deserialize)]` structs that pull only `type`, `timestamp` and `content[].name`.
  - Watcher debounce (`:966-970`): use a max-wait (for example 2 s), so continuous writes can't starve the event.
  - Then raise the fallback poll to 60 s, or drop it.

### 2.3 Git stats: fewer processes, correct invalidation, active tab only
- **Today:** `fs/git.rs:50,92,121-131` runs two `git` processes, then reads every untracked file under 100 KB to count lines.
  - This runs for **every mounted tab**: `enabled = fileWatchingEnabled` at `ProjectTab.jsx:842`, not `isActive`.
  - It runs on **every** global `git-stats-changed` event, with no path filter (`useGitStats.js:57-59`).
- **Change:**
  - Filter events by `event.payload === currentPath`.
  - Enable stats only for the active tab, and refresh on activation.
  - Use `git status --porcelain=v2 -z` plus one `git diff --numstat`, and cap untracked line counting (for example the first 200 files).
  - Canonicalize the path in `fs_watcher.rs:238` so it matches `git.rs:166`. Today invalidation misses the cache key.
  - Raise the `git_cache.rs:15` TTL once invalidation is event-driven.
  - Remove the unused `enabled` flag.

### 2.4 File watcher correctness and cost
- `fs_watcher.rs:42-79`:
  - It walks the tree synchronously and **follows symlinks with no visited set**, so a symlink loop hangs. Workspaces deliberately use symlinked projects.
  - New directories are never watched.
  - Modify events are dropped (`:157-161`).
- **Change:**
  - Async command.
  - A visited set keyed by `(dev, inode)`.
  - On a `Create` of a directory, add a watch for the new subtree.
  - Emit `is_dir` in `fs-changes`, so the frontend stops rendering new directories as files (`useTreeView.js:154`).
  - Forward content-modify events (debounced) as a `git-stats-dirty` hint.

### 2.5 Ref-counted watchers and deduplicated commit handling across tabs
- `FsWatcherStore` (`fs_watcher.rs:97`), `CommitWatcherStore` (`commit_watcher.rs:154`, where a second insert silently replaces the first) and `SubagentWatcherStore` are keyed by path with no refcount.
  - Closing tab A kills the watchers that tab B is using on the same project.
  - **Change:** keep a `HashMap<PathBuf, (Watcher, usize)>`; `start` increments the count and `stop` decrements it.
- `useAutoChangelog.js:47`: each tab on the same repo spawns its own `claude -p` per commit. That is a **real cost and correctness issue**.
  - **Change:** move the listener to an app-level owner, or dedupe by commit hash in a module-level `Set`.

### 2.6 Directory tree payload
- `fs/directory.rs:108-226`:
  - The cache is deep-cloned under the global lock (`:126`).
  - The sort calls `to_lowercase` on every comparison (`:226`). Use `sort_by_cached_key` instead.
  - `parent_path` is sent for every entry. Drop it; the frontend can derive it.
  - The `max_files` truncation is depth-first, so whole subtrees vanish. Truncate breadth-first and send a `truncated: true` flag that the UI shows.
- `ProjectTab.jsx:392-398` (`handleGitChanges`) triggers a **full rescan** when a file merely stops being untracked. Skip the reload in that case, because the file still exists.

### 2.7 Type checking
- `AgentJobsContext.jsx:134-160` runs one `tsc` per changed file, up to 25 files one after another.
- **Change:** run one `tsc --noEmit -p <tsconfig>` per job, in async/`spawn_blocking`, and filter its diagnostics to the changed files. Passing individual files to `tsc` also ignores `tsconfig.json`, so results are currently inaccurate.

### 2.8 Small backend items
- `fs/tokens.rs:623`: `SESSION_USAGE_CACHE` is never evicted, and `c.clone()` (`:732`) copies the whole message map on every 5 s poll. Use remove + re-insert instead, and add LRU eviction (for example 200 sessions).
- `useUpdateChecker` runs once per tab: N GitHub calls every 4 h against an unauthenticated limit of 60/h. Lift it to `App`.
- `spawn_hidden_terminal` emits `hidden-terminal-output` (`pty/commands.rs:374`), but nothing listens. Drop the emitter.
- Dead code to remove:
  - `features/agent-overlay/useSubagents.js` and `useAgentOverlay` (unused)
  - `get_branch_completed_tasks`
  - the unused claude/opencode session commands
  - the unused npm deps `react-syntax-highlighter`, `agentic-compaction` and `@tailwindcss/typography`

---

## 4. Phase 3: React render architecture (root cause B)

### 3.1 Split `AgentJobsContext`
- **Today:** `AgentJobsContext.jsx:953-969` builds an unmemoized `value` that contains streaming `jobs`. Each output batch (`patchJob`, `:486-491`) re-renders **every ProjectTab**, including inactive ones. ProjectTab subscribes only to get `registerContextFiles` (`ProjectTab.jsx:180`).
- **Change:** use three contexts, or one `useSyncExternalStore` store with selectors:
  - `AgentJobsActionsContext`: stable, memoized callbacks.
  - `AgentJobsStateContext`: `jobs`, consumed only by RightSidebar and its dialogs.
  - `AgentJobsContextFilesContext`: `selectedContextFiles` / `registerContextFiles`.
- **Accept:** streaming output commits only RightSidebar.

### 3.2 Split `ToastContext`, and mount one container
- `features/toast/ToastContext.jsx:~108-120`: the value is unmemoized and includes `toasts`.
  - It is consumed by ProjectTab, `useTerminal`, `useTreeView`, StatusBar and CommandPalette, so every toast re-renders every tab.
  - `ToastContainer` is rendered once **per tab** (`DialogHost.jsx:176`).
- **Change:** an actions context (stable `toast.success/error/...`) and a state context. Render a single `<ToastContainer/>` in `App.jsx`.

### 3.3 Isolate prompt-textarea state
- **Today:** `textareaContent` lives in `ProjectTabInner` (`ProjectTab.jsx:122`), so every keystroke re-renders the 1036-line tab, LeftSidebar, DialogHost, TextareaPanel, etc. `buildPrompt` (`:475-494`) recomputes file analysis for every selected file on every keystroke.
- **Change:**
  - Move the text into a `PromptProvider` (or into `TextareaPanel`) and expose `getText()` through a ref for `usePromptSender`.
  - Split prompt building: memoize the file/elements/pattern sections on their own deps, and splice in the text **only at send time** (or debounce it to 150 ms for the preview).
  - Mount `DesignDialog` only after its first open (it currently runs ~1000 lines of hooks while closed, plus a sync `localStorage` read in `getDesignColors()`, `theme-config.js:1552`).

### 3.4 Decompose `ProjectTab.jsx` (1036 lines, ~45 hooks)
- Extract cohesive controllers, each owning its own state so it re-renders independently:
  - `useTerminalController` (session, ready, launch, cwd)
  - `useSidebarController` (tree, search, selection, git filter)
  - `usePromptController` (from 3.3)
  - `useTabShortcuts` (all keyboard listeners, gated on `isActive`)
  - `useTabCommands` (command palette list)
- Wrap `ProjectTab` in `memo`. Memoize the `TabContext` value (`TabContext.jsx:96`) and make `addTab`/`removeTab` use functional updates, so tab switches don't re-render every tab.
- Memoize the rarely-changing provider values (Watcher, Bookmarks, Templates, FileGroups, Theme) with a one-line `useMemo` each.

### 3.5 File tree: flatten and virtualize
- **Today:** `FileTree.jsx:128` / `TreeNode.jsx:115-139` render recursively. The memo comparator runs `setsEqual`/`mapsEqual` per node (`:159-165`), so any identity change of a Set re-renders all visible nodes.
- **Change:**
  - Derive a flat `visibleRows` array (`{path, depth, isDir, isExpanded, isSelected, isPinned, gitStats}`) with `useMemo`.
  - Render it with `@tanstack/react-virtual` (row height is fixed). Each row gets **primitive props**.
  - `useRowCursor.js:31-38` does a `querySelectorAll` and loops over every row after every render. Replace it with index-based cursor state (the virtual list knows the indices), or at least run it only on `[index, rowsVersion]` and touch just the previous/next rows.
- **Accept:** 10 k-file repo with "expand all": scroll at 60 fps, folder toggle < 10 ms.

### 3.6 Replace the file-search index
- `useFileSearch.js:21-34` uses js-search `AllSubstringsIndexStrategy` over `name` **and** full `path`. That is about 20 M index entries for 10 k files, built synchronously, and **rebuilt on every fs change** inside state updaters (`useTreeView.js:67,134,159,213`), which also double-run under StrictMode.
- **Change:**
  - Drop js-search.
  - Keep a flat array of `{lowerName, lowerPath, node}` and filter with `includes`, or with a small fuzzy scorer, on each debounced query: about 2–5 ms for 10 k entries.
  - Update the array incrementally on fs changes.
  - If fuzzy ranking gets heavier, move it to a Worker.

### 3.7 Agent jobs pane
- `RightSidebar.jsx:158-163` runs a 1 Hz `now` ticker that re-renders the pane and every unmemoized `JobCard`, which receive about 10 inline closures each (`:326-347`).
  - **Change:** an `<Elapsed startedAt/>` leaf component with its own ticker, `memo(JobCard)`, and handlers that take a `jobId` and are created once.
- The expanded output (`:821-822`) renders up to 500 lines with `key={i}`. Once the buffer caps, `slice(-500)` re-keys everything.
  - **Change:** give each line a monotonic `seq` from the backend batch and use it as the key. Or render the whole log as one `<pre>` text node with a virtualized/`content-visibility: auto` container.

### 3.8 Drag-resize without React state per mousemove
- Today the left sidebar (`useSidebar.js:14-18`) and right sidebar (`RightSidebar.jsx:127-152`) call `setWidth` on every mousemove, and the right one also does a sync `localStorage.setItem`.
- **Change:** during the drag, write `--sidebar-width` on the container through a ref inside rAF. Commit to state and storage on `mouseup`. Terminal fit already coalesces through rAF.

### 3.9 Prompt growth should not resize the PTY
- `useAutoGrow` grows the textarea up to 8 lines, which shrinks the terminal (`Layout.jsx:8-15`). Each added line causes a SIGWINCH, and Claude Code's Ink UI repaints fully.
- **Change:** either reserve the max height for the prompt pane while it's open, or overlay the growth (an absolutely positioned panel) so the terminal rows stay constant while typing.

### 3.10 `useBlockCaret`
- `useBlockCaret.js:21-49` creates, appends, measures and removes a mirror `<div>` on every `selectionchange` **and** on every value change. That is two forced layouts per keystroke.
- **Change:**
  - Keep one persistent hidden mirror and cache the computed styles (invalidate on resize/theme).
  - Coalesce both triggers into one rAF.
  - Skip `setCaret` when the coordinates are unchanged.

### 3.11 DiffContent
- `DiffContent.jsx:529`: an inline `onCopy` defeats `memo(DiffLine)`, so all visible rows re-render on every scroll frame. Pass `copyChunk` and the chunk id instead.
- `diffLines` plus per-line `computeWordDiff` (`:84-170`) run synchronously. For files over ~2 k lines, move them into a Worker or compute word-diffs lazily for visible rows only.

---

## 5. Phase 4: Terminal throughput & multi-tab cost (root cause D)

### 4.1 Flow control (watermarks)
- **Today:** `useTerminal.js:228` calls `terminal.write(data)` with no callback. The Rust mpsc channel is unbounded (`pty/commands.rs:172`). `yes` / `cat bigfile` therefore pegs the JS thread, and xterm discards data past ~50 MB.
- **Change:**
  - Track `pendingBytes` in JS and use `term.write(data, () => pendingBytes -= len)`.
  - Above HIGH (for example 512 KB), invoke `pty_pause(id)`. Below LOW (128 KB), invoke `pty_resume(id)`.
  - In Rust, the reader thread parks on an `AtomicBool` + `Condvar`, so the kernel PTY buffer throttles the child naturally.

### 4.2 Leading-edge flush for interactive echo
- `pty/commands.rs:48-51, 90-92`: the emitter always waits out the 8 ms deadline, even for a single echoed byte. That puts an 8 ms floor on every keystroke.
- **Change:** if more than 8 ms have passed since the last flush, emit immediately. Batch only while output is continuous.

### 4.3 Binary output over a Tauri Channel
- **Today:** output goes through `app.emit("terminal-output-<id>", json!{…})` (`:97-100`). That is a JSON `Value` clone plus serialization, broadcast to all webviews, and delivered as an eval'd string on WebKitGTK.
- **Change:**
  - Pass a `tauri::ipc::Channel` into `spawn_terminal` and send raw `Vec<u8>`.
  - Call `term.write(Uint8Array)`, since xterm decodes UTF-8 itself.
  - This also deletes `split_valid_utf8` (`:23-36`) and its edge case where corrupt bytes get dropped.

### 4.4 Lazy tab boot
- `App.jsx:136-143` mounts every persisted tab at startup. Each one spawns a PTY (`useTerminal.js:203`) and a WebGL context (`:109`).
- **Change:** keep a `hasBeenActive` flag per tab. Spawn the PTY and create the terminal only on first activation. Until then, show the tab with its title and path only.

### 4.5 WebGL context budget
- Each mounted terminal holds a WebGL context forever, including secondary terminals. Browsers cap these at ~16 and evict the least recently used.
- `rendererRetriesRef` (`useTerminal.js:522-523`) is never reset, so after 3 lifetime losses a terminal is stuck on the DOM renderer.
- **Change:**
  - Dispose the `WebglAddon` when a tab has been inactive for more than ~30 s, and recreate it on activation.
  - Reset the retry counter after a restore that has survived 60 s.

### 4.6 Hidden tabs should skip fit/SIGWINCH on resize
- `useTerminal.js:430` `handleResize` has no `isActive` check, so a window resize makes every terminal in every tab run `fit` + `refresh` + `clearTextureAtlas` + SIGWINCH. Background TUIs then redraw and generate IPC.
- **Change:** if `!isActiveRef.current`, set `dirtyRef = true` and return. The activation path (`ProjectTab.jsx:625-638`) already forces a resize.

### 4.7 Scrollback
- `terminalPrefs.js:13-20` offers up to 200 k lines, which is ~480 MB per 200-col terminal, and reflow on resize is O(scrollback).
- **Change:** show a warning next to options over 50 k lines. Optionally cap background tabs.

### 4.8 Minor terminal items
- `TerminalSearchBar.jsx:59-68`: debounce the search to 150 ms.
- `SecondaryTerminal.jsx:43-51`: remove the double fit per resize (the double rAF). This is already fixed in the primary terminal.
- `useCwdMonitor` (500 ms): after 1.1 it is async. Longer term, use OSC 7 shell integration (`\e]7;file://host/path\a`), parsed from the output stream, so the frontend no longer has to poll.

---

## 6. Phase 5: Build & bundle hygiene

- **5.1** `vite.config.js`: add a `build` block:
  - `target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari15'`
  - `manualChunks` for `react`, `xterm` and `radix`, for cache stability across updates.
  - **Do not** put babel, recharts or markdown in `manualChunks`; let the lazy boundaries own them.
- **5.2** Babel in a Web Worker:
  - `useFileSymbols.js:61-63` parses each file **three times** on the main thread (`extractSymbols`, `extractSignatures`, `extractSkeleton` each call `parse()`).
  - Create `babelWorker.js` that parses once and returns all three results.
  - Longer term, consider an `oxc_parser` Tauri command that mirrors the existing Rust Python parser, which would remove Babel from the frontend entirely.
- **5.3** CSS cleanup:
  - Delete the dead v3 `tailwind.config.js`, `autoprefixer` (redundant in Tailwind v4) and `@tailwindcss/typography`.
  - Bound scanning with `@import "tailwindcss" source("../src")`.
- **5.4** Optionally move non-active themes out of `theme-config.js` (31 KB) into JSON loaded on demand. Low priority.

---

## 7. Phase 6: Guardrails (keep it smooth)

- **6.1** Add a CI bundle-size check (fail if the main chunk exceeds 1.3 MB).
- **6.2** Add a Rust lint/convention: any `#[tauri::command]` that touches `std::fs`, `Command` or `walkdir` must be `async` (enforced by a grep script in `scripts/`).
- **6.3** Add a dev-only `<Profiler>` wrapper around `ProjectTab` that logs commits over 16 ms.
- **6.4** Add to `.patterns/hooks.md`:
  - Context values must be `useMemo`'d.
  - Split fast-changing state from actions.
  - Polls must be gated on `isActive` **and** page visibility.
  - Prefer backend events over polling.
- **6.5** Re-run the baseline scenario from 0.3 after each phase and append the results to `docs/perf-baseline.md`.

---

## 8. Already done well (do not redo)

- **PTY output:**
  - Per-session event names.
  - A dedicated emitter thread that blocks while idle.
  - Output is drained before the exit notice.
  - The UTF-8 carry buffer.
- **Terminal resize and repaint:**
  - SIGWINCH is debounced (120 ms, 400 ms cap) and fits below 20×4 are rejected.
  - Fits and repaints are coalesced through rAF.
  - Background tabs are moved off-screen, which engages xterm's IntersectionObserver pause.
  - Listener and unlisten races are handled throughout.
- **Token usage parsing** (`fs/tokens.rs:604-757`) is incremental and async. **This is the reference pattern** for 2.2.
- **Design and agent-runner commands** are already async, and agent output is batched.
- **Persistence:**
  - Job persistence is debounced with max staleness and excludes `output`.
  - TokenBudget storage is debounced.
- **Watcher:** `fs-changes` has a 1 s debounce with aggregation and shared `IGNORE_DIRS`.
- **Already memoized:** `SubagentContext`, `TokenBudgetContext`, `FileSelectionContext`, `useSidebar`, `useTreeView`, `useSidebarSearch`. `StatusBar` is `memo`'d and active-tab only.
- **DiffContent** is virtualized with a rAF scroll throttle.
- **At-mention search** is debounced and capped.
- **CSS** has no blur, backdrop-filter or heavy shadows. Animations are cheap and respect reduced motion.
- **Startup and build:**
  - Rust boot only registers state.
  - The window has a dark `backgroundColor`, so there is no white flash.
  - lucide and date-fns tree-shake.
  - The dev-only InstrumentKit is eliminated from production.

---

## 9. Suggested execution order & effort

| Order | Items | Effort | Expected effect |
|---|---|---|---|
| 1 | 0.1–0.3 baseline | 0.5 d | Numbers to compare against |
| 2 | 1.1, 1.3, 1.7 (async commands, hook bug, cheap child check) | 0.5 d | Removes UI freezes and the launch-time stalls |
| 3 | 1.2, 1.4 (useDialogs memo, stable Terminal props) | 0.5 d | Typing no longer re-renders the tree |
| 4 | 1.5, 1.6 (branch events, visibility gating) | 0.5 d | Idle CPU near zero |
| 5 | 1.8, 1.9, 1.10 (lazy dialogs, fonts, release profile) | 1 d | ~−55 % initial JS, faster cold start |
| 6 | 3.1, 3.2, 3.3 (context splits, prompt isolation) | 1.5 d | Agent output and toasts no longer touch tabs |
| 7 | 2.1, 4.1, 4.2 (per-session PTY, flow control, leading-edge flush) | 2 d | Low-latency echo, no freeze on floods |
| 8 | 2.2–2.7 (subagents cache, git stats, watcher, refcounts) | 2 d | Background work proportional to change, not history |
| 9 | 3.5, 3.6 (virtualized tree, new search) | 1.5 d | Large repos feel instant |
| 10 | 4.3–4.7 (Channel bytes, lazy tabs, WebGL budget, hidden-tab resize) | 1.5 d | Many tabs scale |
| 11 | 3.4, 3.7–3.11 (ProjectTab decomposition, remaining UI polish) | 2 d | Maintainability + residual jank |
| 12 | Phase 5 & 6 | 1 d | Keeps it that way |

**Total:** roughly 14–15 engineering days. Steps 2–5 (~3 days) deliver most of the perceived smoothness.
