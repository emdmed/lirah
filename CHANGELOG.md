# Changelog

All notable changes to Lirah will be documented in this file.

## [Unreleased]

## [0.24.0] - 2026-11-10

### Added

- **Lirah CLI on Windows** - The `lirah` command now works on Windows through a `lirah.cmd` wrapper, and the app serves its control channel on a named pipe so the CLI can talk to a running instance.

### Fixed

- **Work log on Windows** - Changed files are now matched correctly when tool paths and git paths use different separators.

## [0.23.0] - 2026-11-10

### Added

- **Work log pane** - Records each Claude Code prompt you send and the files it changed, so you can look back over a session.

### Fixed

- **Dialog frames** - Auto commit, Auto merge, Settings, Keyboard shortcuts, Features, Run background agent and Context breakdown now show the corner ticks like every other dialog. Auto commit and Auto merge no longer show a stray horizontal scrollbar or a cut-off message box edge.
- **Menus** - Dropdown menus have a solid background, and the context sets menu drops its redundant label.

## [0.22.1] - 2026-11-10

### Fixed

- **Smooth Zen transition** - Switching Zen on or off now dims the screen to the terminal's colour for a moment while a thin line draws across the edge where the panes go, then fades back in once the terminal has redrawn. Before, the layout jumped, the terminal went blank and its text popped in after the fade, and the prompt box arrived late. Reduced motion keeps the dim and draws the line whole.

## [0.22.0] - 2026-11-10

### Added

- **Zen mode** - Alt+Z (or `:zen`) hides the tab bar, sidebars and status bar so only the terminal is left. A strip above each terminal shows the tab, its branch and the current turn, and a line at the bottom holds workspaces, tabs, waiting agents, running jobs and today's tokens. Files, tabs, plan and context open as drawers from that line. Switching in and out fades and settles the layout.
- **Zen columns** - Show up to three tabs side by side from the tabs drawer (1-3 on a row, or `:column`). Ctrl+Alt+1-3 focuses a column, and Alt+A jumps to the tab that waits for you.
- **Shelve plans** - Take a plan off its tab from the tab card or the plan detail. A shelved plan stays under all plans, and a running auto-pilot is stopped first. Done and shelved plans are hidden behind a show/hide toggle.

### Changed

- **Quieter tabs and context panes** - The summary footer names the stopped run, idle rows drop the "clean" readout and numbered key boxes, the context list is tighter, and the focused pane frame is ink instead of gold.
- **Sidebar section tabs** - Underlined tabs that join the strip rule, with quiet counts and a small mark when the feature map is stale.

## [0.21.0] - 2026-11-09

### Added

- **Auto-pilot catches up after the app closes** - If the agent kept committing chunks while Lirah was closed, the plan picks them up as soon as it loads. The paused run then says which chunks are done and that resume sends the next one.
- **Resume from tab rows** - A paused auto-pilot run can be resumed from its tab row.

### Changed

- **Clearer auto-pilot loop** - All four steps of the loop drawing are named (implement, check, nudge, next), and the chips no longer carry numbers that read as chunk numbers. The drawing shows only while the run is going. A paused run shows its message and resume instead of a red mark.
- **Less repetition in the plan pane** - During a run the timeline drops its count and "slowest" note, and the plan git drawing shrinks to one line, so the chunk list shows without scrolling.
- **Button roles in plans** - Stop no longer looks like a checkbox, "go to tab" is a plain tool, a finished plan's "review all" is the main action, and the revise, chunk edit and decisions forms use a filled save with an outline cancel.
- **Plainer messages** - Commits read as "chunk 11 · title", and a paused run says "Resume to pick up where it stopped".

## [0.20.1] - 2026-11-09

### Fixed

- **No more stutter every few seconds with several tabs open** - The background check for running agents no longer re-renders every tab each time it polls.
- **Typing in tasks stays smooth** - The quick-add box no longer re-renders every task's notes on each keystroke.
- **Huge diffs no longer freeze the window** - A diff that takes longer than half a second to compute (a regenerated lockfile, a minified bundle) is shown as one replaced block.
- **Smoother sidebars** - Streaming job output no longer re-renders the open sidebar section. Dragging a sidebar refits the terminal and figures when you pause instead of on every frame.
- **Fewer git runs** - The feature map only reloads for its own project's changes, not every project's.
- **File tree keeps its place** - Deleting a tracked file updates the tree without the loading flash or losing scroll position.
- **Lighter animations and diff map** - Live race lanes crawl in steps instead of repainting every frame, and the diff map no longer re-lays out its labels while you scroll.

### Changed

- **README** - A new introduction: what Lirah is for, how its gains were measured, and its main features.
- **Commit preview** - The dashed subject-limit line is gone from the commit log figure; characters past the limit are still red.

## [0.20.0] - 2026-11-09

### Changed

- **One button set** - Every button now uses one of a few familiar roles: filled for the main action, outline for the action beside it (Cancel in dialogs), ghost for tools in bars, rows and pane headers, red for destructive actions, and bracketed text for inline actions. Secondary buttons have a visible frame instead of an italic word, and button labels are mono.
- **Focus is an ink ring** - Keyboard focus on buttons and links is an ink ring set 2px off, no longer gold. Gold is kept for live work and things waiting on you.
- **Segmented controls and the launch bar** - Segmented controls sit in one frame with the chosen option tinted. The launch bar's split key is a filled primary.
- **Busy buttons** - A button that is running shows the orbit scanner and stays readable instead of greying out.
- **App icon** - The Lirah icon is a deep slate lyre on a pale-gold tile.
- **Pinned features send every file** - Features pinned to a prompt now send all their files, without the 3-feature / 40-file cap. The feature explorer gets an orbit layout, a restyled details sheet and hover actions on its rows.
- **Context chips** - Chips are split into hairline click areas and spaced further apart.

## [0.19.0] - 2026-11-08

### Added

- **Feature map** - `:features build` asks Claude to map the project's features to their files. Later builds only send changed files. When a prompt names a feature, its files are added to the prompt automatically.
- **FEATURES tab** - The right sidebar lists the mapped features with file counts, how fresh the map is (commits behind, new and missing files) and the build status.
- **Feature explorer** - `:features` opens a full-screen drawing of how features use each other. From there you can open a feature's files, or mark them in the file tree without expanding any folders.
- **Pin features to a prompt** - Add features to the context pane (Alt+5 or the + toggle on a row). Their files go into the next prompt, up to 3 features and 40 files.

### Changed

- **Tab rows** - Tab rows have a fixed height, with one status line and a plan card.
- **Blocked plan runs** - A blocked run now shows as "waiting" in the warning colour instead of as a fault. Paused and failed plans show a hint to open the plan to resume.

## [0.18.0] - 2026-11-08

### Added

- **Status from any CLI** - Programs that report their state with OSC 7501 (the Program Status Protocol) now drive a tab's agent state, the same way Claude Code's hooks do. Lirah answers the protocol's "do you support this?" question, so Claude Code reports its own state too.
- **Wait on several workers** - `lirah tabs wait --any` returns the next worker reply as it lands, `--all` waits for every worker you sent work to.
- **Read, press keys, interrupt** - `lirah tabs read` prints a tab's screen, `lirah tabs keys` presses keys in it (enter, esc, arrows, ctrl+c) and `lirah tabs interrupt` stops its agent's turn. Keys and interrupt refuse a tab waiting on a permission prompt.
- **Wait for output** - `lirah tabs wait <tab> --output <text>` waits until a tab prints that text, such as a dev server's "ready" line.

### Changed

- **Safer sends** - `lirah tabs send` refuses a tab that is waiting on a permission prompt (unless `--force`), and says when a prompt shows no sign of arriving.
- **Full-screen settings** - The settings dialog fills the window; its rows keep a readable width.

### Fixed

- **Interrupted turns end** - Pressing Esc or Ctrl+C on a Claude Code tab (or `lirah tabs interrupt`) no longer leaves it marked as working. Claude sends no hook for an interrupt; Lirah now hears it from Claude's own status report, with the transcript as a backup.

## [0.17.0] - 2026-11-07

### Added

- **Step orbit in git dialogs** - Auto commit, auto merge, auto changelog and race compare show their steps as bodies on one orbit line, so you can see which step is running, waiting on you or failed.

### Changed

- **New Lirah mark** - The logo and app icon are redrawn as a bare lyre with one body in its ring, and the install script now installs the app icon.
- **Simpler tab row** - The tab row's second tier is simplified.
- **Quieter status rail** - The "waiting" and "auto-pilot blocked" notices next to the context meter are gone. Tab rows, the tabs pane and the sidebar still show who needs you.

### Fixed

- **Auto commit failed with a staged deletion** - Auto commit stopped with "Couldn't stage the changes" when a deleted file was already staged. It now commits normally.

## [0.16.0] - 2026-11-07

### Added

- **Orrery theme** - A new night-sky theme. Busy states show an orbit scanner, lamps become reticle marks, there's a startup orrery and splash, and empty panes show an empty-orbit plate.

### Changed

- **Orrery redesign** - New type: Typestar OCR for content and the terminal, Geist Mono for legends, and Spectral italic for names and button labels. The status rail, pane legends, buttons, tooltips and dialogs (with crop ticks) are restyled. Plans get a chunk spine and the tabs pane reads as a ledger. The file tree gets guides and agent marks, and the context chips and Fig. 19 get measure lines.

### Fixed

- **Button labels were hard to read** - Panel buttons such as source, revise and delete now use a regular italic instead of a light one, so the text no longer breaks up on dark panels.

## [0.15.1] - 2026-11-07

### Fixed

- **0.15.0 never shipped** - Its build stopped at the startup size check, so there are no 0.15.0 installers. This release has everything listed under 0.15.0. Task notes now load their markdown renderer when first shown, which takes about 150 KB off the app's startup.

## [0.15.0] - 2026-11-07

### Added

- **Claude mark in the terminal legend** - While `claude` runs in a terminal, its legend shows the Claude mark.
- **Workspace pane keys** - `[` and `]` cycle the pane's sections, `?` opens help at the current section with a legend of its glyphs, each row shows its keys, and `:tabs` joins `:jobs` (which now works).

### Changed

- **Master terminal is now the workspace terminal** - Renamed, with a larger worker fan and a working/total box. The workspace pane is clearer: the TABS count shows who is waiting, each tab is counted once, state words and colours match across sections, row actions show on hover or focus, and workspaces collapse to a chip only when they don't fit.
- **New icons** - Every icon in the app now comes from Iconoir instead of Lucide.
- **Folders open as tabs** - The file tree marks folders that are open as tabs.

### Fixed

- **Failed auto-pilot runs** - A failed run lights a fault lamp on its tab row and names the chunk it stopped on and why (git error, tab closed, blocked). A blocked agent pauses the run instead of failing it.
- **Jobs** - The jobs list shows a single count, the repo on each card, and toasts name the right branch.

## [0.14.1] - 2026-11-06

### Fixed

- **0.14.0 never shipped** - Its build stopped at the startup size check, so there are no 0.14.0 installers. This release has everything listed under 0.14.0. The QA driver now loads only in QA instances, which keeps it out of the app's startup.

## [0.14.0] - 2026-11-06

### Added

- **Agentic QA for contributors** - `npm run qa` starts a throwaway copy of Lirah (its own profile and port, nothing touches your real `~/.lirah`) and has Claude Haiku use it the way a person would, following one recipe per feature in `qa/recipes/`, and reports which steps broke. Nine features have recipes so far: terminal, file tree, tabs, tasks, settings, workspaces, starred projects, the command palette and keyboard shortcuts. New recipes are written by Opus with `/qa-recipes <feature>`. See `qa/README.md`.

### Changed

- **Backups before a data migration** - Before Lirah rewrites a file in `~/.lirah` in a newer format, it saves a copy to `~/.lirah/backups/` (the newest three per file are kept).

## [0.13.0] - 2026-11-06

### Added

- **A plan's whole life, idea to merged** - Each plan now shows its stage: planned, building, implemented, PR open or merged. The plan detail draws a short lifecycle line (idea → planned → building → … → merged) with how long each step took, and links the PR when there is one (found with `gh`). Merge is detected from the plan's commit trailers on the base branch, so it works for merges, rebases and squash merges. When a plan is merged, its task is marked done.
- **Revise and re-chunk a plan** - "revise" in the plan detail sends your notes to the agent in the tab, which edits only the plan file. "re-chunk" splits the plan again from its file while keeping the chunks already done. Agents get the same with `lirah plans revise` and `lirah plans rechunk`, and `lirah plans` lists each plan's stage.

### Changed

- **Auto commit no longer pops up** - When the commit message is ready, the dialog stays closed. The tab shows a green "commit" lamp and the status bar a "commit · ready" chip; click the chip or run auto commit again to review and commit.

## [0.12.0] - 2026-11-05

### Added

- **Plugins: bring your own tools and skills** - Settings → Agent → Plugins takes a folder (say, a CLI wrapper and some skills) and a prompt that says how to use it. Each Claude Code launch loads the folder's skills, tells the agent the folder's path, its scripts and your prompt at session start, and gives it access to the folder. Each plugin has its own on/off switch, and edits in the folder show up in the next session.

## [0.11.0] - 2026-11-04

### Added

- **Workspaces are groups of tabs** - The Workspace pane's legend lists your workspaces: click one to switch, double-click to rename, + to add, × to remove (it asks, then closes its tabs). Alt+W cycles them, and the `workspace <name>` command switches or adds one. Each workspace lists only its own tabs and comes back to the tab you were on; tabs in the other workspaces keep running, and a green dot marks a workspace whose agent is waiting on you. Your open tabs start in a workspace called `main`.
- **Agents manage tasks, plans and jobs** - The `lirah` CLI in a tab gains `lirah tasks` (add, list, done, reopen, edit, remove, move), `lirah plans` (list, import, finish, debug) and `lirah jobs` (list, show, run, cancel, apply).

### Removed

- **Symlink workspaces** - The old workspaces that linked several projects into one folder are gone, with the project picker before lazygit, auto-commit and auto-merge. Folders already in `~/.lirah/workspaces` are left on disk.

## [0.10.0] - 2026-11-04

### Added

- **Format a task as a user story** - A task can be rewritten by a model (Claude Haiku, no tools) into a user story with acceptance criteria. Edits you make while it runs win. Settings → Agent → Tasks has a field for your own formatting prompt; empty uses the user story. Task rows show their notes as markdown, and opening a task edits the whole text in one field.

### Changed

- **Sharper small text** - Legends, keycaps, menu labels and task and plan rows no longer drop below 11px, so the pixel legend face stays crisp. Text no longer uses faked bold, and the terminal uses the same font fallbacks as the rest of the app.

### Fixed

- **Windows** - Agent jobs and their processes stop together and report CPU, workspace projects link with a junction fallback, the terminal PATH is joined per platform, and the sandbox and its palette commands are off on Windows.

## [0.9.0] - 2026-11-04

### Added

- **Send as prompt** - The new plan dialog (now "New plan or prompt") can send the text straight to the tab's agent as a prompt, for tasks that don't need a plan. Ctrl+Enter sends, Ctrl+Shift+Enter splits into chunks. Sending is off while no agent is running in the tab, so the text is never typed into a bare shell.
- **Claude start command** - Settings → Agent → Launch has a field for the command a tab starts Claude Code with, for setups where Lirah can't find `claude` and falls back to `npx`. The row shows the command Lirah uses now. Applies to agents launched after the change.

## [0.8.0] - 2026-11-03

### Added

- **Choose where the first tab opens** - When Lirah starts with no tabs to restore and no folder given on the command line, it opens no tab and asks where the first one works: pick any folder, your home folder, or a starred project. It used to open a tab in your home folder and offer the project picker on top.
- **Change an unstarted plan's git setup** - The git section of a plan no chunk has started has a `change` button. It removes the worktrees, keeps the branches and unlocks the setup, so the next send prepares it again.
- **Auto-pilot opens its own tab** - Auto-pilot and resume open a new tab in the plan's worktrees, launch Claude there and wait for it to report in, instead of asking you to do it.

### Changed

- **Auto commit recovers from failures** - If the message can't be written, the dialog opens with an empty message to write by hand. If git rejects the commit (a hook, a signing failure), the message and staged files are kept and the button reads `Retry commit`. Enter before the message is ready commits as soon as it is. The done line shows the commit's short hash, and a clean working tree reads as a quiet "nothing to commit" instead of a failure.
- **Window controls in the header** - The separate title bar is gone. Minimize, maximize and close sit in the header (at the left on macOS), and the header drags the window while they are shown. The setting is now Settings → Appearance → Window controls. The window also remembers its size, position and maximized state between launches.

### Fixed

- **Windows** - Spawned processes no longer flash a console window. Login shell scripts and the agent launch use PowerShell syntax, and plugin paths are quoted correctly for PowerShell.

## [0.7.0] - 2026-11-03

### Added

- **Tasks** - A `tasks` tab in the workspace pane keeps a backlog: one list per project and a list of global tasks shared by all projects, saved in `~/.lirah/tasks`. Alt+Q (or `:task <text>`) adds one from anywhere. Tasks have notes, reorder by dragging, and can be marked done or moved between the project and the global list. The `plan` button sends a task to the active tab's agent with a plan context in front, and asks for the plan as `<title>_plan.md` at the repo root. The task then reads `planning`, `planned` once the file is written, and links to the plan once it is imported in the plans pane.
- **Task plans split into chunks** - A task you send to plan goes straight on to the plans pane: once the agent has written the plan file and finished its turn, the plan is imported and split into chunks, with a toast to open it. The plan itself is still written with your plan context. On by default; the plan button's menu switches between *Split into chunks* and *Keep the plan file* (git repos only), and a kept file imports with `import & chunk` on the row. Sending asks first when the active tab has no agent or it is busy, so a task is never typed into a bare shell.
- **Plan contexts** - Named instructions sent ahead of a task when you plan it, such as "Create the plan with the grill-me skill". One is the default; the arrow beside `plan` picks another. Edit them from the tasks pane or Settings → Agent → Tasks.
- **`lirah update`** - Run `lirah update` to install the latest release, for user and system installs alike. It skips the install when the latest release is already installed.

## [0.6.0] - 2026-11-02

### Changed

- **Auto commit runs in the background** - Starting an auto commit no longer opens a dialog that blocks the window. The tab row shows a scanner and `commit` where the diff count sits while it stages and writes the message, so you can keep working or switch tabs. When the message is ready the scanner becomes a lit lamp and the dialog opens for review, or when you return to that tab. A failed run reads `commit failed`. Esc on the ready dialog hides it; the `commit · ready` chip in the status bar or the shortcut brings it back, and only Cancel unstages.

### Fixed

- **Plan pane scrolling** - Auto-pilot no longer scrolls the plan pane when it moves to the next chunk; only your own actions do.

## [0.5.7] - 2026-11-02

### Added

- **Calibrated figures** - Small measured drawings, in the manner of an engineering drawing, now explain the features that are hard to put in a sentence. Each replaces the text or progress bar it explains, and each falls back to that text in narrow panes:
  - FIG.06 context window, split into the last turn's cache read, cache write and input, magnified in an inset
  - FIG.09 auto-pilot loop, FIG.16 chunk ruler, FIG.20 plan timeline, FIG.21 plan branch with chunk commits and FIG.22 files by chunk
  - FIG.10 sandbox section, FIG.11 auto-merge plan with the commands it will run, FIG.12 race lanes and FIG.13 subagent fan-out
  - FIG.14 budget ruler with today's pace, FIG.15 keyboard plate for held modifiers, FIG.19 file detail levels with token counts
- **Open a tab's folder** - A folder button on each tab row, the `f` key on a focused row, and `:explore` (alias `:finder`) open the tab's project folder in the system file manager. The file manager runs outside the bubblewrap sandbox, like any app the desktop opens.
- **Figures setting** - Settings → Appearance → Figures (`:figures full|compact`). Compact keeps the previous text-only UI.
- **Fullscreen shell** - Alt+T opens a plain shell in the project directory as terminal 2, maximized to fill the window. Press Alt+T again, or exit the shell, to close it and return focus to the agent terminal. The shell is also in the terminal 2 picker and the palette (`:shell`). Like nvim and lazygit, terminal 2 runs unsandboxed. Inside Lirah, Alt+T no longer reaches readline's transpose-words.

### Changed

- **File tree** - Hidden folders sit under a labelled rule, and the md/git filter keys show how many files they match. While a filter is on, the legend reads "N of M".
- **Empty context** - With nothing attached, the context manifest shows dashed FILES and REPOS chips that jump to the pane that fills them, and the status line reads "nothing attached · prompts go as typed".
- **Confirm dialogs** - Confirmations can list the facts of what they act on, and destructive ones get a fault-coloured confirm button.
- **Menus** - Destructive items sit last, below a rule, and the focused item gets an ink outline.
- **Undo toast** - The toast's top edge drains to show the time left to undo.
- The live star in a figure glides to its next place and takes the lamps' softer glow in light themes; reduced motion snaps it.

## [0.1.13] - 2026-02-16

### Added

- **Token Usage Dashboard v2** - Complete overhaul of token analytics with comprehensive visualizations:
  - Calendar heatmap showing daily token usage patterns
  - Historical browser for exploring past sessions with detailed metrics
  - Model insights panel breaking down usage by AI model (Claude 3.5 Sonnet, GPT-4o, etc.)
  - Model pie chart for visual cost distribution
  - Project comparison tool for analyzing token usage across multiple projects
  - Session efficiency panel tracking cost per message and success rates
  - Interactive token line chart with time range filtering and cache token toggle
  - Usage summary panel with real-time statistics
  - Export functionality for generating detailed usage reports
  - Filter panel with date range, project, and model filtering capabilities

- **Flowchart Generation** - Generate visual flowcharts from natural language descriptions using Mermaid syntax. Accessible from the textarea panel to create diagrams for architecture, workflows, and processes.

- **Auto Commit** - Automatic commit generation and staging with AI assistance. Features configurable commit message templates, keyboard shortcuts in the commit dialog (Ctrl+Enter to commit, Escape to cancel), and integration with the existing git workflow.

- **Auto Changelog** - Automated changelog generation based on recent commits. Analyzes commit history and suggests changelog entries following Keep a Changelog format.

- **nvim & lazygit Shortcuts** - Quick launch shortcuts for opening neovim and lazygit directly in the current working directory. Accessible via the secondary terminal picker or dedicated keybindings.

- **Token Alert Banner** - Visual warning banner when approaching or exceeding configured token budget thresholds.

- **Token Cost Estimation** - Real-time cost estimates displayed in the textarea panel showing anticipated token usage before sending prompts.

- **Export Report Dialog** - Dedicated dialog for exporting token usage data in multiple formats (JSON, CSV) with date range and filter selection.

### Changed

- **Major App Refactoring** - Significant restructuring of React components and hooks for improved maintainability and performance
- **Improved File Context & Orchestration** - Enhanced file selection context with better state management and orchestration workflow integration
- **Token Dashboard Performance** - Optimized rendering with deferred loading, data caching, and improved chart performance
- **Splash Screen Improvements** - Enhanced loading experience with better visual feedback
- **Install Script** - Robust installation script with dependency checks, CLI symlink creation, and improved fetch handling
- **Secondary Terminal** - Better integration with quick-launch shortcuts and directory synchronization

### Fixed

- Token calculation accuracy for various file types
- Dashboard data loading and caching issues
- File tree selection state management
- Dialog focus and keyboard navigation

## [0.1.12] - 2026-02-11

### Security

- **Bubblewrap Sandbox** - Optional sandboxing for terminal sessions using bubblewrap (bwrap). Wraps the PTY shell in a Linux namespace with defense-in-depth filesystem and process isolation:
  - Read-only root filesystem (`--ro-bind / /`)
  - Read-only home directory with scoped write access to the active project, `~/.claude`, and `~/.config`
  - Isolated `/tmp` via private tmpfs
  - PID namespace isolation (`--unshare-pid`) — sandboxed processes cannot see or signal host processes
  - UTS namespace isolation (`--unshare-uts`) — hostname changes don't leak to the host
  - IPC namespace isolation (`--unshare-ipc`) — prevents shared memory attacks across boundary
  - Scoped writable paths for `~/.claude`, `~/.config`, `~/.cache`, `~/.npm`, `~/.local` — only essential directories are writable

### Added

- **Secondary Terminal** - Open a second terminal side-by-side with `Ctrl+\``. Supports launching predefined commands (lazygit, nvim, etc.) via a picker dialog. Opens in the same working directory as the primary terminal.
- **Windows Support** - Full Windows compatibility with PowerShell integration, Windows CWD detection via `sysinfo` crate, and platform-aware path handling throughout the app
- **macOS Support** - Full macOS compatibility with platform-aware PTY spawning, CWD detection via `lsof`, and conditional sandbox support (Linux-only)
- **Sandbox Toggle** - Toggle sandbox on/off from the StatusBar settings dropdown. Terminal automatically restarts with the new setting. State persisted in localStorage.
- **Sandbox Indicator** - Lock/unlock icon in the sidebar badge shows sandbox status at a glance
- **Terminal Restart on Toggle** - Toggling sandbox cleanly closes the old PTY session and spawns a fresh one with the updated config
- **Retro Theme** - New retro-inspired theme option in the theme selector
- **Compact Sections Dialog** - New dialog for selectively compacting project sections instead of the entire project at once
- **Show Dotfiles** - Dotfiles are now visible in the file tree
- **Orchestration Token Estimation** - Orchestration mode now estimates and displays the additional tokens used by workflow templates
- **Orchestration Auto-Detection** - Orchestration mode now automatically disables when a project has no `.orchestration/` folder, with updated status bar indicator

### Changed

- **Rust `fs` Module Split** - Refactored monolithic `fs.rs` into submodules (`commands`, `cwd`, `directory`, `git`, `tokens`) for better maintainability
- **Keyboard Shortcuts Dialog** - Fixed "Open Projects Palette" label to "Open Bookmarks Palette" to match actual functionality
- Renamed orchestration command from `npx claude-orchestration` to `npx agentic-orchestration`
- Consistent button styling across dialogs and panels
- Refined input background colors across all themes

### Fixed

- Slow UI when opening secondary terminal — debounced ResizeObserver callbacks, added `overflow-hidden` to primary terminal container, wrapped terminal components in `React.memo()`
- Secondary terminal now spawns in the primary terminal's working directory instead of defaulting to home
- CWD detection for sandboxed terminals by resolving bwrap's child process PID via `/proc/[pid]/task/[tid]/children`
- Leaked PTY sessions when restarting terminal by explicitly closing the old session before remounting
- Sandbox compatibility on Ubuntu
- Path normalization across platforms with new `pathUtils.js` utility module
- File tree view rendering issues on Windows (hidden/system directories, symlink traversal)
- Flat view navigation for Windows path separators
- Shell path escaping for PowerShell compatibility
- `notify` crate configuration for cross-platform support

### Dependencies

- Added `sysinfo = "0.33"` (Windows) for process CWD detection
- Updated `notify` to use default features for cross-platform support

## [0.1.11] - 2026-02-07

### Added

- **Element Picker** - Select specific code elements (functions, components, classes, hooks) from files instead of entire files. Features Python parser via rustpython-parser, enhanced JS/TS symbol extraction, and interactive dialog with bulk selection capabilities.
- **@-Mention File Search** (`@` in textarea) - Type `@` in the textarea to search and insert file paths inline. Fast recursive search with keyboard navigation.
- **Initial Project Dialog** - On launch, presents bookmarked projects for quick selection with keyboard navigation and auto-launch into Claude mode.
- **Enhanced Compact Project** (`Ctrl+Shift+P`) - Extended project compaction with Python support and useEffect hook detection. Generate intelligent representations of your entire project optimized for token efficiency.
- **Theme System** - New theme configuration with Catppuccin Mocha dark theme and Typestar-OCR font support.
- **File Groups** - Save and restore frequently used file selections. Groups are persisted in localStorage and filtered by current project path.
- **Token Usage Display** - Real-time session token usage (input/output) shown in the status bar, polling Claude Code's session files every 5 seconds.
- **Last Prompt Restoration** (`Ctrl+Shift+Z`) - Restore your previous prompt when the textarea is empty.
- **Token Benchmarking Tools** - Scripts for measuring and comparing token improvements.
- **Install Dependencies Script** - New `scripts/install-deps.sh` to simplify dependency setup.

### Changed

- Enhanced JavaScript/TypeScript symbol extraction and new Python symbol parser for better code analysis
- Improved detection for React hooks, custom hooks, classes with decorators, and TypeScript interfaces
- Better handling of file and element selection states with enhanced clearing functionality
- Improved parsing error management with better fallback behavior for unparsable files
- Keyboard shortcuts dialog layout and styling improvements
- Initial project dialog styling with dashed borders, selected item outline, and keyboard hints
- File tree visual hierarchy with better spacing, compact node heights, and refined git badge integration
- Terminal focus indicator with ring border outline
- Element picker integration with search icon buttons for parseable files in Claude mode
- Dialog layout spacing, button layout, and loading states
- Smoother transitions, better hover states, and improved checkbox styling
- Consistent font sizing using CSS variables and improved line heights
- Consistent dashed border styling across dialogs and panels

### Fixed

- Git diff mismatch between git status and displayed diffs
- Claude project path parsing and detection
- Babel symbol parser for extracting function signatures
- Token estimation and formatting
- Template selector functionality issues
- Dependency installation issues
- @-mention modal selection and search behavior
- Scrollbar styling
- Handling of large files with forced grep

### Dependencies

- Added `rustpython-parser = "0.4"` for Python code parsing capability

## [Unreleased]

## [0.1.9] - 2025-01-15

Initial tracked release.

### Added

- Embedded terminal with PTY support
- File browser sidebar with bidirectional sync
- Prompt textarea for multi-line prompts
- File context selection (modify, do-not-modify, use-as-example)
- Smart token optimization for JS/TS files
- Prompt templates
- Git filter mode
- Claude orchestration workflow templates
