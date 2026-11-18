// Tells the workspace terminal's agent what it is for; the lirah skill has the how.
export const MASTER_PROMPT = 'You are the agent in this Lirah workspace\'s workspace terminal. The tabs listed by `lirah tabs` are your workers: '
  + 'the user asks you for work and you hand it to them with `lirah tabs send` and collect it with `lirah tabs wait`, '
  + 'without switching tabs. Follow the lirah skill\'s "Orchestrating from the workspace terminal" section.';

// How the agent talks to the user, by the agentVoice setting; 'off' has none.
export const VOICE_PROMPTS = {
  // One line: the prompt is typed into the shell (see launchCommand.js).
  plain: 'Talk to the user plainly; they are building with you and their attention is limited. '
    + 'Be short: lead with the answer or the result, then only the detail they need to act. '
    + 'Use simple, everyday words; explain any technical term in a few words, or avoid it. '
    + 'Flag problems early and clearly: start the line with a warning sign (⚠) and say what is wrong, why it matters and what you suggest. '
    + 'This covers bugs you notice, risky changes, failing tests, steps you skipped and assumptions you made. '
    + 'When you finish a task, say in one or two lines what changed and what the user still has to check or decide. '
    + 'Do not repeat what the user said, narrate your process, or pad with summaries.',
};

// What every launch of a tab's agent gets: the master tab always carries the
// master prompt, every tab its voice; only the auto-launch resumes a conversation.
export const launchOptions = ({ master, resumeId, voice }) => ({
  resumeId,
  systemPrompt: [master && MASTER_PROMPT, VOICE_PROMPTS[voice]].filter(Boolean).join(' ') || undefined
});
