// The agent CLIs Lirah knows about.

// Agents a tab runs interactively. `id` is the settings value (selectedCli and
// the auto-commit/changelog CLIs), `process` is the binary and the process name
// looked for in the tab's terminal. Settings shows `title`, the rest `label`.
export const TAB_CLIS = [
  { id: 'claude-code', process: 'claude', label: 'Claude Code', title: 'Claude Code' },
  { id: 'opencode', process: 'opencode', label: 'opencode', title: 'OpenCode' },
];

/** Process names of the tab CLIs, to spot or stop one running in a terminal. */
export const TAB_CLI_PROCESSES = TAB_CLIS.map((c) => c.process);

const tabCli = (id) => TAB_CLIS.find((c) => c.id === id);

/** The process a tab CLI runs as; Claude's for an unknown id. */
export const tabCliProcess = (id) => tabCli(id)?.process ?? 'claude';

/** A tab CLI's label; the id itself for an unknown one. */
export const tabCliLabel = (id) => tabCli(id)?.label || id;

// Agents the job runner knows how to drive headlessly. `bin` is what gets probed
// on PATH; `value` is the id the Rust registry matches on.
export const JOB_CLIS = [
  { value: 'claude', label: 'Claude Code', bin: 'claude' },
  { value: 'opencode', label: 'opencode', bin: 'opencode' },
  { value: 'codex', label: 'Codex', bin: 'codex' },
  { value: 'gemini', label: 'Gemini', bin: 'gemini' },
  { value: 'cursor-agent', label: 'Cursor', bin: 'cursor-agent' },
  { value: 'amp', label: 'Amp', bin: 'amp' },
];
