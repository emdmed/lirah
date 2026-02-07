# Changelog

All notable changes to Lirah will be documented in this file.

## [0.1.11] - 2026-02-07

### 🚀 Features

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

### 🔄 Updates

- **Enhanced Symbol Parsers** - Improved JavaScript/TypeScript symbol extraction and new Python symbol parser for better code analysis.
- **Better Element Detection** - Enhanced detection for React hooks, custom hooks, classes with decorators, and TypeScript interfaces.
- **Improved File Selection State Management** - Better handling of file and element selection states with enhanced clearing functionality.
- **Enhanced Error Handling** - Improved parsing error management with better fallback behavior for unparsable files.
- **Keyboard Shortcuts Dialog** - Improved layout and styling for better readability.

### 🐛 Fixes

- Fixed git diff mismatch between git status and displayed diffs
- Fixed Claude project path parsing and detection
- Fixed Babel symbol parser for extracting function signatures
- Fixed token estimation and formatting
- Fixed template selector functionality issues
- Fixed dependency installation issues
- Fixed @-mention modal selection and search behavior
- Fixed scrollbar styling
- Improved handling of large files with forced grep

### 🎨 UI Enhancements

- **Initial Project Dialog** - Dashed border styling, selected item outline, and keyboard hints consistent with project design language
- **File Tree Improvements** - Enhanced visual hierarchy with better spacing, compact node heights, and refined git badge integration
- **Terminal Focus Indicator** - Added ring border outline for better focus feedback
- **Element Picker Integration** - Clean search icon buttons for parseable files in Claude mode
- **Dialog Layout Improvements** - Better spacing, button layout, and loading states
- **Enhanced Interactions** - Smoother transitions, better hover states, and improved checkbox styling
- **Typography Refinements** - Consistent font sizing using CSS variables and improved line heights
- **Engineering Sketch Borders** - Consistent dashed border styling across dialogs and panels

### 📦 Dependencies

- Added `rustpython-parser = "0.4"` for Python code parsing capability

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
