import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { git, repoTop, worktreeRemove } from '../../lib/git';
import { jobWorktreesDir, jobsDir, lirahDir } from '../../lib/lirahPaths';
import { getCurrentWorkspaces, workspaceListStore } from '../../lib/workspaceStore';
import { listen } from '@tauri-apps/api/event';
import { notify } from '../../lib/notify';

// Split so consumers subscribe only to what they read: streamed job output
// changes `jobs` many times a second, and ProjectTab must not re-render for it.
const AgentJobsActionsContext = createContext(undefined);
const AgentJobsStateContext = createContext(undefined);
const AgentJobsRecipesContext = createContext(undefined);

const MAX_OUTPUT_LINES = 500;

// Job-list persistence: coalesce bursts, but never go longer than this without
// writing, so a long-running job's state survives a crash.
const PERSIST_DEBOUNCE = 400;
const PERSIST_MAX_STALENESS = 3000;

// Job records, one list per workspace, beside the jobs' logs and reports.
const jobStore = workspaceListStore('jobs/jobs.json', 'jobs');
// Saved step sequences, run again on demand.
const recipeStore = workspaceListStore('jobs/recipes.json', 'recipes');

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/** A job's ordered steps. Jobs from before steps existed ran one prompt. */
export function jobSteps(job) {
  return job.steps?.length ? job.steps : [{ cli: job.cli, prompt: job.prompt }];
}

/** Index of the step to start after the current one ends, or null when the run is over. */
export function nextStepIndex(job, success) {
  const i = job?.stepIndex ?? 0;
  if (!success || job?.status !== 'running' || i >= jobSteps(job).length - 1) return null;
  return i + 1;
}

// Re-runs of the same job share one card: same recipe, or same label, repo and steps.
export const runKey = (j) => j.recipeId || JSON.stringify([j.label, j.repoPath || j.cwd, jobSteps(j)]);

/** Runs grouped per job, latest run first; groups ordered by their latest start. */
export function groupRuns(jobs) {
  const groups = new Map();
  for (const j of [...jobs].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))) {
    const k = runKey(j);
    if (groups.has(k)) groups.get(k).push(j);
    else groups.set(k, [j]);
  }
  return [...groups.values()];
}

// Path of a job's change relative to the repo root, given its cwd.
export function relToRepo(job, p) {
  return job.cwd && p.startsWith(job.cwd + '/') ? p.slice(job.cwd.length + 1) : p;
}

// Write a persistent markdown run log for a finished job, in its workspace
// jobs folder so it survives app restarts.
async function writeJobReport(job, { success, exitCode, endedAt }) {
  try {
    const home = await invoke('get_home_dir');
    const stamp = new Date(endedAt).toISOString().replace(/[:.]/g, '-');
    const safeLabel = (job.label || 'job').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40);
    const path = `${jobsDir(home, job.workspaceId)}/${stamp}-${safeLabel}.md`;
    const steps = jobSteps(job);
    const at = (job.stepIndex ?? 0) + 1;

    // Prefer the full on-disk log — the in-memory buffer is capped at
    // MAX_OUTPUT_LINES, so long jobs would otherwise lose their earliest output.
    let outputText = job.output.map((o) => o.chunk).join('\n');
    if (job.logPath) {
      try {
        const full = await invoke('read_file_content', { path: job.logPath });
        if (full.trim()) outputText = full.replace(/\n$/, '');
      } catch {
        // Log file missing — fall back to the in-memory buffer above.
      }
    }

    const md = [
      `# ${job.label}`,
      '',
      `- **Status:** ${success ? 'done' : `failed at step ${at}/${steps.length}`} (exit ${exitCode})`,
      `- **Working dir:** ${job.cwd}`,
      `- **Started:** ${new Date(job.startedAt).toISOString()}`,
      `- **Finished:** ${new Date(endedAt).toISOString()}`,
      '',
      '## Steps',
      '',
      ...steps.flatMap((s, i) => [`### ${i + 1} · ${s.cli}`, '', s.prompt, '']),
      '## Output',
      '',
      '```text',
      outputText,
      '```',
      '',
    ].join('\n');

    await invoke('write_file_content', { path, content: md });
    return path;
  } catch {
    return null;
  }
}

// Remove worktrees under ~/.lirah/worktrees/ that no job in `liveJobs` claims.
// Jobs no longer make worktrees; this clears what the old isolated jobs left,
// keeping those whose job record (and its unapplied changes) is still listed.
// Only ever touches paths inside that directory. Best-effort.
async function gcOrphanWorktrees(home, liveJobs) {
  if (!home) return 0;
  const root = jobWorktreesDir(home);
  let entries = [];
  try {
    entries = await invoke('read_directory', { path: root });
  } catch {
    return 0; // No worktrees directory.
  }
  const claimed = new Set(liveJobs.map((j) => j.worktreePath).filter(Boolean));
  let removed = 0;
  for (const entry of entries) {
    if (!entry.is_dir || claimed.has(entry.path)) continue;
    if (!entry.path.startsWith(`${root}/`)) continue; // paranoia: never stray outside
    try {
      // Resolve the repo that owns this worktree so git can tear down its admin
      // files too — a bare `rm -rf` would leave the parent repo with a stale
      // worktree registration.
      let repoRoot = null;
      try {
        const common = await git(entry.path, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
        repoRoot = common.trim().replace(/\/\.git\/?$/, '') || null;
      } catch {
        // --path-format needs git 2.31+. The first entry of `worktree list` is
        // always the main worktree, which is the repo we need.
        const list = await git(entry.path, ['worktree', 'list', '--porcelain']);
        repoRoot = list.split('\n')[0]?.replace(/^worktree\s+/, '').trim() || null;
      }
      if (!repoRoot) continue;
      await worktreeRemove(repoRoot, entry.path);
      removed += 1;
    } catch {
      // Not a worktree, repo gone, or removal refused — leave it alone.
    }
  }
  return removed;
}

export function AgentJobsProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const recipesRef = useRef(recipes);
  recipesRef.current = recipes;

  const patchJob = useCallback((id, updater) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...(typeof updater === 'function' ? updater(j) : updater) } : j))
    );
  }, []);

  // Persistence: the job list lives only in React state, but the backend keeps
  // running detached jobs (and its PID map) across a webview reload. Persist the
  // list to disk and rehydrate on mount so the panel survives reloads/restarts.
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const home = await invoke('get_home_dir');
        // Before workspaces had job files, every job was in ~/.lirah/jobs-state.json.
        const saved = await jobStore.load(async () => {
          try {
            const raw = await invoke('read_file_content', { path: `${lirahDir(home)}/jobs-state.json` });
            return JSON.parse(raw) || [];
          } catch {
            return []; // First run or unreadable state — start empty.
          }
        });
        const savedRecipes = await recipeStore.load(async () => []);
        // Jobs whose backend threads are still alive (webview reload, not a full
        // restart) — those keep streaming, so leave them 'running' and let the
        // listeners below finalize them.
        let liveIds = [];
        try {
          liveIds = await invoke('list_running_agent_jobs');
        } catch {
          liveIds = [];
        }
        const liveSet = new Set(liveIds);

        // Snapshots carry no output (it lives in the job's log file). A running
        // job whose process is gone was cut off by an app restart.
        const recovered = saved.map((entry) => {
          const job = { ...entry, output: entry.output || [] };
          if (job.status !== 'running' || liveSet.has(job.id)) return job;
          return {
            ...job,
            status: 'interrupted',
            endedAt: job.endedAt || Date.now(),
            error: 'Interrupted — the app was closed while it ran.',
          };
        });

        if (!cancelled) {
          setJobs(recovered);
          setRecipes(savedRecipes);
        }
        if (!cancelled) await gcOrphanWorktrees(home, recovered);
      } catch {
        // Persistence unavailable — run in-memory only.
      } finally {
        hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced write-back of the job list whenever it changes (post-hydration).
  //
  // `output` is deliberately excluded: the full stream is already mirrored to
  // logPath on disk, so persisting up to MAX_OUTPUT_LINES per job meant
  // stringifying and rewriting megabytes of text that a reload can read back
  // from the log anyway.
  //
  // A running job changes state faster than the debounce, which used to reset
  // the timer forever and leave nothing persisted for the whole run — so a write
  // is forced once the snapshot is older than PERSIST_MAX_STALENESS.
  const lastPersistRef = useRef(0);
  useEffect(() => {
    if (!hydratedRef.current) return;
    const write = () => {
      lastPersistRef.current = Date.now();
      jobStore.save(jobs.map(({ output, ...rest }) => rest));
    };
    if (Date.now() - lastPersistRef.current >= PERSIST_MAX_STALENESS) {
      write();
      return;
    }
    const timer = setTimeout(write, PERSIST_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [jobs]);

  useEffect(() => {
    if (hydratedRef.current) recipeStore.save(recipes);
  }, [recipes]);

  // Start step `index` of a job. Every step runs under the job's id, so its
  // output lands on the same card and in the same log file.
  const runStep = useCallback(async (job, index) => {
    const steps = jobSteps(job);
    const { cli, prompt } = steps[index];
    if (index > 0) {
      patchJob(job.id, (j) => ({
        stepIndex: index,
        cli,
        idleSecs: 0,
        output: [...j.output, { stream: 'stdout', chunk: `── step ${index + 1}/${steps.length} · ${cli} ──` }]
          .slice(-MAX_OUTPUT_LINES),
      }));
    }
    try {
      await invoke('run_agent_job', { jobId: job.id, cli, prompt, cwd: job.cwd, logPath: job.logPath, streamJson: false });
    } catch (e) {
      patchJob(job.id, { status: 'failed', error: String(e), endedAt: Date.now() });
    }
  }, [patchJob]);

  // Stream output + completion events from the backend.
  useEffect(() => {
    let unlistenOutput = null;
    let unlistenDone = null;
    let unlistenIdle = null;
    let cancelled = false;

    const finalizeJob = async (job, exitCode, success, timedOut = false) => {
      // A cancelled (or otherwise no-longer-running) job can still emit a backend
      // 'done' event when its process finally exits. Don't let that resurrect it
      // to 'done' or fire a spurious report + notification.
      if (job.status !== 'running') return;
      const next = nextStepIndex(job, success);
      if (next !== null) {
        runStep(job, next);
        return;
      }
      const endedAt = Date.now();
      const stillRunning = () => jobsRef.current.find((j) => j.id === job.id)?.status === 'running';
      // Use the freshest job snapshot so the report captures the full output.
      const fresh = jobsRef.current.find((j) => j.id === job.id) || job;
      const reportPath = await writeJobReport(fresh, { success, exitCode, endedAt });
      if (!stillRunning()) return;
      patchJob(job.id, {
        status: success ? 'done' : 'failed',
        exitCode,
        endedAt,
        reportPath,
        idleSecs: 0,
        ...(timedOut && {
          error: 'Stopped after 15 min with no output or CPU work. The agent was probably waiting on an approval it can\'t get in a headless run.',
        }),
      });
      const n = jobSteps(job).length;
      notify(
        success ? 'Agent job finished' : 'Agent job failed',
        success ? `${job.label} — ${n} step${n === 1 ? '' : 's'}` : `${job.label} — step ${(job.stepIndex ?? 0) + 1}/${n} failed`
      );
    };

    (async () => {
      // The backend coalesces output, so one event carries many lines — appending
      // the whole batch in a single state update instead of one per line is what
      // keeps a chatty job from re-rendering the sidebar hundreds of times a second.
      const uo = await listen('agent-job://output', (event) => {
        const { jobId, lines } = event.payload;
        if (!lines?.length) return;
        patchJob(jobId, (j) => ({
          output: [...j.output, ...lines].slice(-MAX_OUTPUT_LINES),
        }));
      });
      const ud = await listen('agent-job://done', (event) => {
        const { jobId, exitCode, success, timedOut } = event.payload;
        const job = jobsRef.current.find((j) => j.id === jobId);
        if (job) finalizeJob(job, exitCode, success, timedOut);
      });
      // The backend watchdog: how long a running job has gone without output
      // or CPU work (0 when it picks up again).
      const ui = await listen('agent-job://idle', (event) => {
        const { jobId, idleSecs } = event.payload;
        patchJob(jobId, (j) => (j.status === 'running' ? { idleSecs } : {}));
      });
      if (cancelled) {
        uo();
        ud();
        ui();
        return;
      }
      unlistenOutput = uo;
      unlistenDone = ud;
      unlistenIdle = ui;
    })();

    return () => {
      cancelled = true;
      if (unlistenOutput) unlistenOutput();
      if (unlistenDone) unlistenDone();
      if (unlistenIdle) unlistenIdle();
    };
  }, [patchJob, runStep]);

  // Launch a background job: its steps run one after another, in place in the
  // repo, and the first failing step ends the run.
  const launchJob = useCallback(async ({
    steps,
    label,
    repoPath,
    recipeId = null,
    workspaceId = getCurrentWorkspaces().activeWorkspaceId,
  }) => {
    const list = (steps || []).filter((s) => s?.cli && s.prompt?.trim());
    if (!list.length) throw new Error('a job needs at least one step with a prompt');
    const id = makeId();
    const home = await invoke('get_home_dir').catch(() => null);
    // Full output is mirrored here so it survives the in-memory cap and reloads.
    const logPath = home ? `${jobsDir(home, workspaceId)}/${id}.log` : null;
    // The repo root (works from a subdirectory); outside git, the folder itself.
    const cwd = await repoTop(repoPath).catch(() => repoPath);

    const job = {
      id,
      label,
      steps: list,
      stepIndex: 0,
      cli: list[0].cli,
      prompt: list[0].prompt,
      recipeId,
      status: 'running',
      repoPath: cwd,
      cwd,
      workspaceId,
      output: [],
      exitCode: null,
      error: null,
      logPath,
      startedAt: Date.now(),
      endedAt: null,
    };
    setJobs((prev) => [job, ...prev]);
    await runStep(job, 0);
    return id;
  }, [runStep]);

  const cancelJob = useCallback(async (id) => {
    patchJob(id, { status: 'cancelled', endedAt: Date.now() });
    try {
      await invoke('cancel_agent_job', { jobId: id });
    } catch {
      // Ignore — process may have already exited.
    }
  }, [patchJob]);

  // Run a finished job again with the same steps.
  const rerunJob = useCallback(async (id) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return null;
    // Bring the card's archived runs back with the new run.
    const key = runKey(job);
    setJobs((prev) => prev.map((j) => (j.archived && runKey(j) === key ? { ...j, archived: false, archivedAt: null } : j)));
    return launchJob({
      steps: jobSteps(job),
      label: job.label,
      repoPath: job.repoPath,
      recipeId: job.recipeId ?? null,
      workspaceId: job.workspaceId,
    });
  }, [launchJob]);

  // Archive: tuck a finished job out of the main list; report and log are untouched.
  const archiveJob = useCallback((id) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job || job.status === 'running') return;
    patchJob(id, { archived: true, archivedAt: Date.now() });
  }, [patchJob]);

  const unarchiveJob = useCallback((id) => {
    patchJob(id, { archived: false, archivedAt: null });
  }, [patchJob]);

  const discardJob = useCallback(async (id) => {
    const job = jobsRef.current.find((j) => j.id === id);
    // Only jobs from before steps existed ran in a worktree.
    if (job?.worktreePath) {
      try {
        await git(job.repoPath, ['worktree', 'remove', '--force', job.worktreePath]);
      } catch {
        // Worktree may already be gone.
      }
    }
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  // Create or update a recipe; returns its id.
  const saveRecipe = useCallback(({ id, name, repoPath, steps, workspaceId }) => {
    const existing = id && recipesRef.current.find((r) => r.id === id);
    const recipe = {
      id: existing ? id : makeId(),
      name: name.trim(),
      repoPath,
      steps: steps.filter((s) => s?.cli && s.prompt?.trim()),
      workspaceId: existing?.workspaceId ?? workspaceId ?? getCurrentWorkspaces().activeWorkspaceId,
    };
    setRecipes((prev) => (existing ? prev.map((r) => (r.id === id ? recipe : r)) : [...prev, recipe]));
    return recipe.id;
  }, []);

  const deleteRecipe = useCallback((id) => {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const runRecipe = useCallback(async (id) => {
    const recipe = recipesRef.current.find((r) => r.id === id);
    if (!recipe) throw new Error('recipe not found');
    return launchJob({
      steps: recipe.steps,
      label: recipe.name,
      repoPath: recipe.repoPath,
      recipeId: recipe.id,
      workspaceId: recipe.workspaceId,
    });
  }, [launchJob]);

  /** The current job list (newest first), for agent control. */
  const getJobs = useCallback(() => jobsRef.current, []);
  const getRecipes = useCallback(() => recipesRef.current, []);

  const actions = useMemo(() => ({
    getJobs,
    getRecipes,
    launchJob,
    cancelJob,
    rerunJob,
    discardJob,
    archiveJob,
    unarchiveJob,
    saveRecipe,
    deleteRecipe,
    runRecipe,
  }), [getJobs, getRecipes, launchJob, cancelJob, rerunJob, discardJob, archiveJob, unarchiveJob,
    saveRecipe, deleteRecipe, runRecipe]);

  return (
    <AgentJobsActionsContext.Provider value={actions}>
      <AgentJobsStateContext.Provider value={jobs}>
        <AgentJobsRecipesContext.Provider value={recipes}>
          {children}
        </AgentJobsRecipesContext.Provider>
      </AgentJobsStateContext.Provider>
    </AgentJobsActionsContext.Provider>
  );
}

// Stable callbacks only — never re-renders the caller when jobs change.
export function useAgentJobsActions() {
  const actions = useContext(AgentJobsActionsContext);
  if (actions === undefined) {
    throw new Error('useAgentJobsActions must be used within an AgentJobsProvider');
  }
  return actions;
}

// Everything, including the live job list and recipes. For the jobs pane and its dialog.
export function useAgentJobs() {
  const actions = useAgentJobsActions();
  const jobs = useContext(AgentJobsStateContext);
  const recipes = useContext(AgentJobsRecipesContext);
  return useMemo(() => ({ ...actions, jobs, recipes }), [actions, jobs, recipes]);
}
