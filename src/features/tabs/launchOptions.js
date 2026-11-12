// Tells the workspace terminal's agent what it is for; the lirah skill has the how.
export const MASTER_PROMPT = 'You are the agent in this Lirah workspace\'s workspace terminal. The tabs listed by `lirah tabs` are your workers: '
  + 'the user asks you for work and you hand it to them with `lirah tabs send` and collect it with `lirah tabs wait`, '
  + 'without switching tabs. Follow the lirah skill\'s "Orchestrating from the workspace terminal" section.';

// What every launch of a tab's agent gets: the master tab always carries the
// master prompt; only the auto-launch resumes a conversation.
export const launchOptions = ({ master, resumeId }) => ({
  resumeId,
  systemPrompt: master ? MASTER_PROMPT : undefined
});
