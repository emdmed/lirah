# Changelog

All notable changes to Lirah will be documented in this file.

## [0.1.11] - 2026-02-05

### Features

- **Element Picker** - Select specific code elements (functions, components, classes, hooks) from files instead of entire files. Features Python parser via rustpython-parser, enhanced JS/TS symbol extraction, and interactive dialog with bulk selection capabilities.

- **Compact Project** (`Ctrl+Shift+P`) - Generate a compact representation of your entire project optimized for token efficiency. Intelligently parses JS/TS files to extract function signatures and skeletons instead of full content.

- **File Groups** - Save and restore frequently used file selections. Groups are persisted in localStorage and filtered by current project path.

- **Token Usage Display** - Real-time session token usage (input/output) shown in the status bar, polling Claude Code's session files every 5 seconds.

- **Last Prompt Restoration** (`Ctrl+Shift+Z`) - Restore your previous prompt when the textarea is empty.

- **Token Benchmarking Tools** - Scripts for measuring and comparing token improvements.

- **Install Dependencies Script** - New `scripts/install-deps.sh` to simplify dependency setup.

### Fixes

- Fixed git diff mismatch between git status and displayed diffs
- Fixed Claude project path parsing and detection
- Fixed Babel symbol parser for extracting function signatures
- Fixed token estimation and formatting
- Fixed dependency installation issues
- Improved handling of large files with forced grep

### UI Enhancements

- Improved file tree styling with better visual hierarchy and spacing
- Enhanced terminal focus indicator with ring border
- Refined git diff badges and file node layout
- Cleaner element picker button integration in file tree

## [Unreleased]

## [0.1.9] - 2025-01-15

Initial tracked release.

### Features

- Embedded terminal with PTY support
- File browser sidebar with bidirectional sync
- Prompt textarea for multi-line prompts
- File context selection (modify, do-not-modify, use-as-example)
- Smart token optimization for JS/TS files
- Prompt templates
- Git filter mode
- Claude orchestration workflow templates
