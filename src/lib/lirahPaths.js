// Where Lirah keeps its files, under ~/.lirah.

export const lirahDir = (home) => `${home}/.lirah`;

// Agent jobs' worktrees. Jobs garbage-collect everything in here.
export const jobWorktreesDir = (home) => `${lirahDir(home)}/worktrees`;

// Plans' worktrees: kept out of jobWorktreesDir so the job GC leaves them alone.
export const planWorktreesRoot = (home) => `${lirahDir(home)}/plan-worktrees`;

/** Folder of one plan's worktrees. */
export const planWorktreesDir = (home, plan) => `${planWorktreesRoot(home)}/${plan.slug}-${plan.id}`;
