# Changelog

All notable changes to Lirah will be documented in this file.

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
