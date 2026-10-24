// Sources of context tokens, as returned by get_context_breakdown, with the
// terminal palette colour each one draws in. Red, yellow and their bright
// variants are left out: they are the fault and warn lamps, and a source
// drawn in them reads as a problem.
export const CONTEXT_GROUPS = {
  results: { label: 'Tool results', hint: 'Output of Read, Bash, Grep, Agent… kept in the conversation', color: 'blue' },
  calls: { label: 'Tool calls', hint: 'Inputs Claude sent to tools: Write/Edit bodies, commands', color: 'cyan' },
  thinking: { label: 'Thinking', hint: 'Earlier thinking blocks, sent back on every request', color: 'magenta' },
  reminders: { label: 'Reminders & hooks', hint: 'Hook output, system reminders, CLAUDE.md, startup lists', color: 'brightBlue' },
  tools: { label: 'Tool definitions', hint: 'Schemas of every tool, fixed per session', color: 'brightCyan' },
  system: { label: 'System prompt', hint: 'Claude Code’s instructions', color: 'brightMagenta' },
  replies: { label: 'Claude’s replies', hint: 'Text Claude wrote to you', color: 'green' },
  prompts: { label: 'Your prompts', hint: 'What you typed', color: 'white' },
  images: { label: 'Images', hint: 'Pasted images and screenshots', color: 'brightWhite' },
  unlogged: { label: 'System prompt + tools', hint: 'Not in this transcript; the remainder of what the API reported', color: 'brightBlack' },
  other: { label: 'Other', hint: '', color: 'brightBlack' },
};

export function groupLabel(group) {
  return CONTEXT_GROUPS[group]?.label || group;
}

export function groupColor(palette, group) {
  return palette?.[CONTEXT_GROUPS[group]?.color] || palette?.foreground || 'currentColor';
}

export function sharePct(n, total) {
  if (!total) return '0%';
  const p = (n / total) * 100;
  return p < 1 && p > 0 ? '<1%' : `${Math.round(p)}%`;
}

// Labels carry absolute paths; inside the project, show them relative.
export function shortLabel(label, projectPath) {
  if (!projectPath || !label) return label;
  return label.split(projectPath + '/').join('');
}
