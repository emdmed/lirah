import { createContext } from 'react';

// Every row of the dialog. Toggle and choice rows render from this through
// ToggleRow and ChoiceRow; custom rows are drawn by hand and only use the
// label/words here. `words` is what the filter matches (label plus synonyms),
// so the search index can't drift from what is shown. `key` names the value
// the row edits; string hints are the default, the dialog passes the dynamic ones.
export const SETTINGS_ROWS = [
  {
    id: 'default-cli', section: 'agent', kind: 'choice', key: 'selectedCli',
    label: 'Default CLI', hint: 'New tabs start with it. Switch this tab\'s CLI from the status bar.',
    words: 'default cli claude code opencode agent new tabs',
  },
  {
    id: 'auto-launch', section: 'agent', kind: 'toggle', key: 'autoLaunchCli',
    label: 'Auto-launch agent',
    hint: 'Start the CLI when a terminal opens or you open a starred project. Off shows a launch key instead.',
    words: 'auto-launch launch starred projects start cli terminal open',
  },
  {
    id: 'agent-state-hook', section: 'agent', kind: 'toggle', key: 'agentStateHook',
    label: 'Agent state hook',
    hint: 'The agent tells its tab when it is working, needs permission or is done. Off: Lirah guesses from terminal output. Applies to agents launched after the change.',
    words: 'agent state hook hooks plugin working permission done status opencode',
  },
  {
    id: 'compaction-hook', section: 'agent', kind: 'toggle', key: 'compactionHook',
    label: 'Compaction hook',
    hint: 'Lets each Claude Code tab switch on a hook that keeps a grep-first project index fresh for its agent. Applies to agents launched after the change.',
    words: 'compaction hook hooks index grep orchestration plugin',
  },
  {
    id: 'keep-context', section: 'agent', kind: 'toggle', key: 'keepFilesAfterSend',
    label: 'Keep context after send', hint: 'Attached files, elements and linked repos stay for the next prompt.',
    words: 'keep context after send files elements repos',
  },
  {
    id: 'prompt-box', section: 'agent', kind: 'toggle', key: 'promptBoxOnStart',
    label: 'Prompt box on new tabs',
    hint: 'Off: tabs show a one-line context status and you type prompts in the terminal; Claude Code gets the selected context through Lirah\'s hook.',
    words: 'prompt box textarea context status composer terminal type',
  },
  { id: 'theme', section: 'appearance', kind: 'custom', label: 'Theme', words: 'theme colors dark light palette' },
  {
    id: 'title-bar', section: 'appearance', kind: 'toggle', key: 'showTitleBar',
    label: 'Title bar', hint: 'Window title bar above the panes.',
    words: 'title bar window chrome',
  },
  {
    id: 'scrollback', section: 'terminal', kind: 'choice', key: 'scrollback',
    label: 'Scrollback', hint: 'Lines kept per terminal.',
    words: 'scrollback lines history memory buffer',
  },
  {
    id: 'file-watching', section: 'terminal', kind: 'toggle', key: 'fileWatchingEnabled',
    label: 'File watching',
    words: 'file watching watch refresh files pane disk',
  },
  {
    id: 'auto-commit', section: 'git', kind: 'choice', key: 'autoCommitCli',
    label: 'Auto commit', choiceLabel: 'Auto commit CLI',
    words: 'auto commit cli message agent',
  },
  {
    id: 'commit-prompt', section: 'git', kind: 'custom', label: 'Extra commit instructions',
    words: 'extra commit instructions prompt message',
  },
  {
    id: 'changelog', section: 'git', kind: 'toggle', key: 'autoChangelogEnabled',
    label: 'Auto changelog', hint: 'An agent updates a changelog file after commits or merges.',
    words: 'auto changelog trigger target file cli',
  },
  { id: 'budget', section: 'budget', kind: 'custom', label: 'Token budget', words: 'token budget daily weekly limit cost' },
  {
    id: 'sandbox', section: 'sandbox', kind: 'toggle', key: 'sandboxEnabled',
    label: 'Sandbox', hint: 'Applies to this tab. Turning it on or off restarts the terminal.',
    words: 'sandbox bubblewrap jail isolation security',
  },
  {
    id: 'network', section: 'sandbox', kind: 'toggle', key: 'networkIsolation',
    label: 'Network isolation',
    words: 'network isolation offline block internet',
  },
];

/** A row's config by id. */
export const SETTINGS_ROW = Object.fromEntries(SETTINGS_ROWS.map((r) => [r.id, r]));

// Section index: the rail, the 1–6 keys and the filter all read from this.
// `rows` maps a row id to the words it should match, from SETTINGS_ROWS.
const rowsOf = (section) => Object.fromEntries(
  SETTINGS_ROWS.filter((r) => r.section === section).map((r) => [r.id, r.words]),
);

export const SECTIONS = [
  { id: 'agent', title: 'Agent', blurb: 'Which CLI starts, and what a prompt keeps after sending.' },
  { id: 'appearance', title: 'Appearance', blurb: 'Theme and window chrome.' },
  { id: 'terminal', title: 'Terminal', blurb: 'Terminal memory and the files pane.' },
  { id: 'git', title: 'Git', blurb: 'Agent-written commit messages and changelog entries.' },
  { id: 'budget', title: 'Budget', blurb: 'Token limits for this project.' },
  { id: 'sandbox', title: 'Sandbox', blurb: 'Run this tab\'s terminal in a bubblewrap jail.' },
].map((s) => ({ ...s, rows: rowsOf(s.id) }));

// The settings filter, for the rows to hide themselves.
export const FilterContext = createContext({ query: '', filtering: false });

export function rowMatches(words, query) {
  return query.split(/\s+/).every((term) => words.includes(term));
}
