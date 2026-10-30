// Every keyboard shortcut the app handles, in one list. The help dialog, the
// held-modifier hint bar and the `:` palette's key hints all read from here,
// so they can't drift apart. Adding a binding means adding its handler AND an
// entry here; an entry without a handler is a bug.
//
//   keys            full key names, as the help dialog prints them
//   note            the condition or extra keys, shown beside the keys
//   hint            { bar: 'ctrl' | 'ctrl+shift' | 'always', label }: shown
//                   in the hint bar while that modifier is held
//   paletteCommand  the `:` command that does the same, which then shows
//                   these keys in its suggestion row
//   match(e)        whether a keydown event is this shortcut; handlers test
//                   it with matches(id, e). Entries whose handler lives in a
//                   component of its own (palette, prompt, terminal, files
//                   pane) don't have one yet.
//
// Handlers: App.jsx (tabs, Alt+A), usePaneShortcuts (Alt+1-4),
// useTabShortcuts (incl. Ctrl+Shift+E), useViewModeShortcuts,
// useTextareaShortcuts, useHelpShortcut, useBookmarksShortcut,
// useCommandPalette, useTerminal's key handler (Ctrl+F/G/Shift+F with the
// terminal focused), useRowCursor (files pane).

import { isFocusMode } from './focusMode';

const mod = (e) => e.ctrlKey || e.metaKey; // Ctrl, or Cmd
const alt = (e) => e.altKey && !e.ctrlKey && !e.metaKey; // Alt alone, Shift allowed
const key = (k) => (e) => e.key === k;

export const SHORTCUT_CATEGORIES = ['Tabs', 'Panes & Views', 'Prompt', 'Agent & CLI', 'Files & Search', 'Git', 'Token Usage'];

export const SHORTCUTS = [
  // Tabs
  { id: 'tab-new', keys: ['Ctrl', 'T'], description: 'New Tab', category: 'Tabs', hint: { bar: 'ctrl', label: 'new tab' }, paletteCommand: 'tab', match: (e) => mod(e) && e.key === 't' && !e.shiftKey && !e.altKey },
  { id: 'tab-close', keys: ['Ctrl', 'W'], description: 'Close Tab', category: 'Tabs', note: 'when more than one is open', hint: { bar: 'ctrl', label: 'close tab' }, paletteCommand: 'close', match: (e) => mod(e) && e.key === 'w' && !e.shiftKey && !e.altKey },
  { id: 'tab-next', keys: ['Ctrl', 'Tab'], description: 'Next Tab', category: 'Tabs', note: '+Shift for previous', match: (e) => mod(e) && e.key === 'Tab' },
  { id: 'tab-goto', keys: ['Ctrl', '1-9'], description: 'Go to Tab N', category: 'Tabs', hint: { bar: 'ctrl', label: 'go to tab' }, match: (e) => mod(e) && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9' },
  { id: 'attention-jump', keys: ['Alt', 'A'], description: 'Jump to Agent Waiting on You', category: 'Tabs', note: 'repeat for the next', paletteCommand: 'waiting', match: (e) => alt(e) && !e.shiftKey && e.code === 'KeyA' },

  // Panes & views
  { id: 'pane-focus', keys: ['Alt', '1-4'], description: 'Focus Pane', category: 'Panes & Views', note: 'files · terminal · prompt · jobs', hint: { bar: 'always', label: 'panes' }, match: (e) => alt(e) && !e.shiftKey && /^Digit[1-4]$/.test(e.code) },
  { id: 'nav-mode', keys: ['Ctrl', 'S'], description: 'Navigation Mode', category: 'Panes & Views', note: 'stops a running agent, asks first', match: (e) => e.ctrlKey && e.key === 's' },
  { id: 'palette', keys: ['Ctrl', ':'], description: 'Command Palette', category: 'Panes & Views', note: 'or : outside a text field', hint: { bar: 'ctrl', label: 'commands' } },
  { id: 'bookmarks', keys: ['Ctrl', 'P'], description: 'Starred projects', category: 'Panes & Views', paletteCommand: 'marks' },
  { id: 'secondary', keys: ['Ctrl', '`'], description: 'Toggle Secondary Terminal', category: 'Panes & Views', paletteCommand: 'term', match: (e) => mod(e) && e.key === '`' },
  { id: 'nvim', keys: ['Alt', 'N'], description: 'Open Nvim', category: 'Panes & Views', note: 'secondary terminal', paletteCommand: 'nvim', match: (e) => alt(e) && key('n')(e) },
  { id: 'help', keys: ['Ctrl', 'H'], description: 'Toggle This Dialog', category: 'Panes & Views', hint: { bar: 'ctrl', label: 'help' }, paletteCommand: 'help', match: (e) => e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'h' },

  // Prompt
  { id: 'prompt-send', keys: ['Ctrl', 'Enter'], description: 'Send Prompt', category: 'Prompt', note: 'in the prompt', hint: { bar: 'ctrl', label: 'send' } },
  { id: 'prompt-restore', keys: ['Ctrl', 'Shift', 'Z'], description: 'Restore Last Prompt', category: 'Prompt', note: 'when empty' },
  { id: 'compact', keys: ['Ctrl', 'Shift', 'P'], description: 'Toggle Compaction Hook', category: 'Prompt', hint: { bar: 'ctrl+shift', label: 'compaction' }, paletteCommand: 'compact', match: (e) => mod(e) && e.shiftKey && e.key === 'P' },
  { id: 'templates', keys: ['Alt', 'Alt'], description: 'Open Instructions (templates + patterns) / Clear Template', category: 'Prompt', note: 'double-tap', doubleTap: true },
  { id: 'at-mention', keys: ['@'], description: 'Quick File Search', category: 'Prompt', note: 'type @ in the prompt', highlight: true },

  // Agent & CLI
  { id: 'cli', keys: ['Ctrl', 'K'], description: 'Launch CLI / Tree View', category: 'Agent & CLI', hint: { bar: 'ctrl', label: 'cli' }, paletteCommand: 'launch', match: (e) => e.ctrlKey && e.key === 'k' },
  { id: 'clear-context', keys: ['Ctrl', 'Shift', 'L'], description: 'Clear CLI Context', category: 'Agent & CLI', hint: { bar: 'ctrl+shift', label: 'clear ctx' }, paletteCommand: 'clear', match: (e) => e.ctrlKey && e.shiftKey && e.key === 'L' },

  // Files & search
  { id: 'file-search', keys: ['Ctrl', 'F'], description: 'Focus File Search', category: 'Files & Search', note: 'tree view or terminal', match: (e) => mod(e) && e.key === 'f' },
  { id: 'git-filter', keys: ['Ctrl', 'G'], description: 'Toggle Git Changes Filter', category: 'Files & Search', note: 'terminal focused', hint: { bar: 'ctrl', label: 'git' }, paletteCommand: 'git' },
  { id: 'md-filter', keys: ['Ctrl', 'M'], description: 'Toggle Markdown Filter', category: 'Files & Search', hint: { bar: 'ctrl', label: 'md' }, paletteCommand: 'md', match: (e) => e.ctrlKey && e.key === 'm' },
  { id: 'terminal-search', keys: ['Ctrl', 'Shift', 'F'], description: 'Search Terminal Output', category: 'Files & Search', note: 'terminal focused' },
  { id: 'parent-dir', keys: ['Backspace'], description: 'Parent Directory', category: 'Files & Search', note: 'files pane, nav mode · also h or -' },

  // Git
  { id: 'commit', keys: ['Ctrl', 'Shift', 'Space'], description: 'Auto Commit', category: 'Git', hint: { bar: 'ctrl+shift', label: 'commit' }, paletteCommand: 'commit', match: (e) => mod(e) && e.shiftKey && e.key === ' ' },
  { id: 'merge', keys: ['Alt', 'M'], description: 'Merge Branch Into Base', category: 'Git', paletteCommand: 'merge', match: (e) => alt(e) && key('m')(e) },
  { id: 'lazygit', keys: ['Alt', 'L'], description: 'Open Lazygit', category: 'Git', paletteCommand: 'lazygit', match: (e) => alt(e) && key('l')(e) },

  // Token usage
  { id: 'tokens', keys: ['Ctrl', 'Shift', 'D'], description: 'Open Token Dashboard', category: 'Token Usage', hint: { bar: 'ctrl+shift', label: 'tokens' }, paletteCommand: 'tokens', match: (e) => mod(e) && e.shiftKey && e.key === 'D' },
  { id: 'budget', keys: ['Ctrl', 'Shift', 'B'], description: 'Open Budget Settings', category: 'Token Usage', paletteCommand: 'budget', match: (e) => mod(e) && e.shiftKey && e.key === 'B' },
];

const COMPACT = { Ctrl: '^', Shift: '⇧', Alt: 'alt', Enter: '↵', Space: 'space', Tab: 'tab', Backspace: '⌫' };

/** Keys as terse keycaps (`^ ⇧ P`), for the hint bar and palette rows. */
export function compactKeys(keys) {
  return keys.map((k) => COMPACT[k] ?? k);
}

/** The shortcuts, grouped for the help dialog, in category order. */
export function shortcutsByCategory() {
  return SHORTCUT_CATEGORIES.map((category) => ({
    category,
    items: SHORTCUTS.filter((s) => s.category === category),
  }));
}

/** Hint bar entries for a held modifier chord, plus the always-shown ones. */
export function hintBarEntries(held) {
  return {
    held: SHORTCUTS.filter((s) => s.hint?.bar === held),
    always: SHORTCUTS.filter((s) => s.hint?.bar === 'always'),
  };
}

const MODIFIER_KEYS = new Set(['Ctrl', 'Shift', 'Alt']);
// The hint bar's chords are 'ctrl' and 'ctrl+shift' (useModifierHold); Shift
// alone never shows the bar, so 'shift' means the Ctrl+Shift chord.
const CHORD = { ctrl: 'ctrl', shift: 'ctrl+shift', 'ctrl+shift': 'ctrl+shift', alt: 'alt' };

/**
 * The keys bound under a held modifier, as the hint bar shows them, in
 * registry order: [{ key, label, n }]. `key` is the non-modifier key name
 * as written in the registry ('T', '1-9', 'Enter', 'Space', '`'), `label`
 * the hint label, `n` the 1-based position. No hint-bar entry uses Alt, so
 * 'alt' returns [].
 */
export function boundKeysFor(mod) {
  const chord = CHORD[mod];
  if (!chord) return [];
  return hintBarEntries(chord).held.map((s, i) => ({
    key: s.keys.filter((k) => !MODIFIER_KEYS.has(k)).join(' '),
    label: s.hint.label,
    n: i + 1,
  }));
}

const BY_COMMAND =new Map(SHORTCUTS.filter((s) => s.paletteCommand).map((s) => [s.paletteCommand, s]));

/** Compact keys of the shortcut doing what palette command `id` does, if any. */
export function shortcutForCommand(id) {
  const s = BY_COMMAND.get(id);
  return s ? compactKeys(s.keys) : null;
}

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

/** Compact keys of registry shortcut `id` (e.g. 'templates' → ['alt','alt']), if any. */
export function shortcutKeys(id) {
  const s = BY_ID.get(id);
  return s ? compactKeys(s.keys) : null;
}

/** Whether keydown `e` is shortcut `id`. Never while nvim/lazygit has the window. */
export function matches(id, e) {
  if (isFocusMode()) return false;
  return !!BY_ID.get(id)?.match?.(e);
}
