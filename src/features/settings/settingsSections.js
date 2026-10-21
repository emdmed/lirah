import { createContext } from 'react';

// Section index: the rail, the 1–6 keys and the filter all read from this.
// `rows` maps a row id to the words it should match (its label plus synonyms).
export const SECTIONS = [
  {
    id: 'agent', title: 'Agent', blurb: 'Which CLI starts, and what a prompt keeps after sending.',
    rows: {
      'default-cli': 'default cli claude code opencode agent new tabs',
      'auto-launch': 'auto-launch launch starred projects start cli',
      'keep-context': 'keep context after send files elements repos',
    },
  },
  {
    id: 'appearance', title: 'Appearance', blurb: 'Theme and window chrome.',
    rows: {
      theme: 'theme colors dark light palette',
      'title-bar': 'title bar window chrome',
    },
  },
  {
    id: 'terminal', title: 'Terminal', blurb: 'Terminal memory and the files pane.',
    rows: {
      scrollback: 'scrollback lines history memory buffer',
      'file-watching': 'file watching watch refresh files pane disk',
    },
  },
  {
    id: 'git', title: 'Git', blurb: 'Agent-written commit messages and changelog entries.',
    rows: {
      'auto-commit': 'auto commit cli message agent',
      'commit-prompt': 'extra commit instructions prompt message',
      changelog: 'auto changelog trigger target file cli',
    },
  },
  {
    id: 'budget', title: 'Budget', blurb: 'Token limits for this project.',
    rows: { budget: 'token budget daily weekly limit cost' },
  },
  {
    id: 'sandbox', title: 'Sandbox', blurb: 'Run this tab\'s terminal in a bubblewrap jail.',
    rows: {
      sandbox: 'sandbox bubblewrap jail isolation security',
      network: 'network isolation offline block internet',
    },
  },
];

// The settings filter, for the rows to hide themselves.
export const FilterContext = createContext({ query: '', filtering: false });

export function rowMatches(words, query) {
  return query.split(/\s+/).every((term) => words.includes(term));
}
