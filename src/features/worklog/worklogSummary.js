import { basename } from '../../utils/pathUtils';

// The work log pane's summary mode: a model reads the log and writes what was
// done, by repo, as short markdown. Run by the summarize_worklog command.

export const SUMMARY_MODELS = ['haiku', 'sonnet', 'opus'];

// shortcut: the newest MAX_ENTRIES prompts, each cut to MAX_PROMPT chars, keep the input small; summarize in chunks if a week outgrows it.
const MAX_ENTRIES = 300;
const MAX_PROMPT = 400;
const MAX_FILES = 8;

// Local midnight `daysBack` days before `now` (setDate, so DST days stay whole).
const midnight = (now, daysBack) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysBack);
  return d.setHours(0, 0, 0, 0);
};
/** The summary periods: entries since `since(now)`. */
export const PERIODS = [
  { id: 'today', label: 'today', since: (now) => midnight(now, 0) },
  { id: 'week', label: '7 days', since: (now) => midnight(now, 6) },
  { id: 'all', label: 'all shown', since: () => 0 },
];

const stamp = (at) => {
  const d = new Date(at);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function line(e) {
  const prompt = e.prompt.replace(/\s+/g, ' ').trim();
  const cut = prompt.length > MAX_PROMPT ? `${prompt.slice(0, MAX_PROMPT)}…` : prompt;
  const files = e.files == null
    ? 'still running'
    : e.files.length === 0
      ? 'none'
      : e.files.slice(0, MAX_FILES).join(', ') + (e.files.length > MAX_FILES ? ` (+${e.files.length - MAX_FILES} more)` : '');
  return `- ${stamp(e.at)} | ${basename(e.repo || '') || '?'} | ${e.branch || '-'} | ${cut} | files: ${files}`;
}

/** The prompt for `entries` (oldest first); `scope` names what they cover, e.g. "nevo-terminal, today". */
export function buildSummaryPrompt(entries, scope) {
  const recent = entries.slice(-MAX_ENTRIES);
  const skipped = entries.length - recent.length;
  return `Summarize a developer's work log so they can see at a glance what they worked on.

Each line below is one prompt they sent to Claude Code:
time | repo | branch | prompt | files changed

Write short markdown, readable in 30 seconds:
- One "### <repo>" heading per repo.
- Under each, 1-5 bullets of what got done, as outcomes ("Added …", "Fixed …"). Merge prompts about the same thing. Name a file only when it helps. If the repo's work spans several branches, end each bullet with its branch in parentheses.
- Then a "### Open threads" section with work that looks unfinished (no files changed, questions, follow-ups that were never done). Leave it out if there are none.
- Plain words. Output only the summary: no preamble, no closing note, no remarks on how it was made or what you couldn't check.

Scope: ${scope}${skipped > 0 ? ` (the ${skipped} oldest prompts are left out)` : ''}

${recent.map(line).join('\n')}
`;
}
