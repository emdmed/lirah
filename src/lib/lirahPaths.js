// Where Lirah keeps its files, under ~/.lirah.

export const lirahDir = (home) => `${home}/.lirah`;

// Agent jobs' worktrees. Jobs garbage-collect everything in here.
export const jobWorktreesDir = (home) => `${lirahDir(home)}/worktrees`;

// Plans' worktrees: kept out of jobWorktreesDir so the job GC leaves them alone.
export const planWorktreesRoot = (home) => `${lirahDir(home)}/plan-worktrees`;

/** Folder of one plan's worktrees. */
export const planWorktreesDir = (home, plan) => `${planWorktreesRoot(home)}/${plan.slug}-${plan.id}`;

/** A workspace's job folder: job records, logs, run reports and patches. */
export const jobsDir = (home, workspaceId) => `${lirahDir(home)}/workspaces/${workspaceId}/jobs`;

/** A repo's HTML artifacts, relative to ~/.lirah: its path with every separator as "-". */
export const artifactsRel = (repo) => `artifacts/${repo.replace(/[\\/:]/g, '-')}`;

/** The stored file name for an artifact: safe characters only, always .html. */
export const artifactName = (raw) => `${String(raw).replace(/\.html?$/i, '').replace(/[^\w.-]+/g, '-') || 'artifact'}.html`;

