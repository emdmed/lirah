import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const AgentJobsContext = createContext(undefined);

const MAX_OUTPUT_LINES = 500;

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function basename(p) {
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || 'repo';
}

// Parse `git status --porcelain` into absolute paths of changed files.
function parsePorcelain(output, cwd) {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      // Format: "XY <path>" or "XY <old> -> <new>" for renames.
      const rest = line.slice(3);
      const path = rest.includes(' -> ') ? rest.split(' -> ')[1] : rest;
      return { path: `${cwd}/${path.replace(/^"|"$/g, '')}` };
    });
}

// Write a persistent markdown run log for a finished job. Lives under
// ~/.lirah/jobs/<repo>/ so it survives worktree removal and app restarts.
async function writeJobReport(job, { changedFiles, success, exitCode, endedAt }) {
  try {
    const home = await invoke('get_home_dir');
    const stamp = new Date(endedAt).toISOString().replace(/[:.]/g, '-');
    const safeLabel = (job.label || 'job').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40);
    const repoName = job.repoPath.replace(/\/+$/, '').split('/').pop() || 'repo';
    const path = `${home}/.lirah/jobs/${repoName}/${stamp}-${safeLabel}.md`;

    const rel = (p) => (job.cwd && p.startsWith(job.cwd + '/') ? p.slice(job.cwd.length + 1) : p);
    const filesList = changedFiles.length
      ? changedFiles.map((f) => `  - ${rel(f.path)}`).join('\n')
      : '  - (none)';
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
      `- **CLI:** ${job.cli}`,
      `- **Status:** ${success ? 'done' : 'failed'} (exit ${exitCode})`,
      `- **Isolated worktree:** ${job.useWorktree ? 'yes' : 'no'}`,
      `- **Working dir:** ${job.cwd}`,
      `- **Started:** ${new Date(job.startedAt).toISOString()}`,
      `- **Finished:** ${new Date(endedAt).toISOString()}`,
      `- **Changed files (${changedFiles.length}):**`,
      filesList,
      '',
      '## Prompt',
      '',
      job.prompt,
      '',
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

// Sum added/removed lines across a worktree's changes. `git add -N` records
// intent-to-add for untracked files so they show up in `git diff --numstat` as
// additions (without staging their content), giving a full +/- count in one go.
// Only safe to call on an isolated worktree — never the user's real working tree.
async function computeDiffStat(cwd) {
  try {
    await invoke('run_git_command', { repoPath: cwd, args: ['add', '-N', '.'] });
    const out = await invoke('run_git_command', { repoPath: cwd, args: ['diff', '--numstat'] });
    let added = 0;
    let removed = 0;
    for (const line of out.split('\n')) {
      const [a, d] = line.trim().split(/\s+/);
      if (a === '-' || d === '-') continue; // binary file — no line counts
      const na = parseInt(a, 10);
      const nd = parseInt(d, 10);
      if (!Number.isNaN(na)) added += na;
      if (!Number.isNaN(nd)) removed += nd;
    }
    return { added, removed };
  } catch {
    return null;
  }
}

// Files worth type-checking as a post-merge gate. tsc follows imports, so
// checking a changed file also catches references to symbols another job
// renamed or removed elsewhere.
const TYPECHECK_EXT = /\.(ts|tsx|js|jsx)$/i;
const TYPECHECK_MAX_FILES = 25;

// Path of a job's change relative to the repo root, given its cwd (worktree).
function relToRepo(job, p) {
  return job.cwd && p.startsWith(job.cwd + '/') ? p.slice(job.cwd.length + 1) : p;
}

// Run tsc over a set of changed files and aggregate. `files` is an array of
// { path } with ABSOLUTE paths (in whatever tree you want checked). Missing
// files (deletions), non-JS/TS files, and a missing tsc are skipped rather than
// treated as failures — this gate only fails on real type errors. Capped so a
// huge job can't spawn hundreds of tsc runs; the cap is reported, never silent.
async function typecheckChangedFiles(changedFiles) {
  const candidates = (changedFiles || [])
    .map((f) => f.path)
    .filter((p) => TYPECHECK_EXT.test(p));
  const checked = candidates.slice(0, TYPECHECK_MAX_FILES);
  let errorCount = 0;
  const failed = [];
  for (const path of checked) {
    try {
      const res = await invoke('check_file_types', { filePath: path });
      if (res && res.error_count > 0) {
        errorCount += res.error_count;
        failed.push({ path, errorCount: res.error_count });
      }
    } catch {
      // File gone, unsupported type, or tsc not installed — skip, don't fail.
    }
  }
  return {
    status: 'done',
    checked: checked.length,
    skipped: candidates.length - checked.length,
    errorCount,
    failed,
  };
}

// Build the instruction prompt for the semantic-reconcile agent. It receives
// each source job's intent + touched files so it can integrate them coherently,
// not just resolve textual conflicts.
function buildReconcilePrompt(jobs, conflictJobs) {
  const rel = (job, p) => (job.cwd && p.startsWith(job.cwd + '/') ? p.slice(job.cwd.length + 1) : p);
  const goals = jobs
    .map((j, i) => {
      const files = j.changedFiles.map((f) => rel(j, f.path)).join(', ') || '(no files)';
      return `${i + 1}. ${j.label}\n   Files touched: ${files}\n   Goal: ${(j.prompt || '').trim()}`;
    })
    .join('\n\n');

  const conflictNote = conflictJobs.length
    ? `Some changes overlapped: the working tree contains git conflict markers (<<<<<<<, =======, >>>>>>>) from these jobs — ${conflictJobs
        .map((j) => j.label)
        .join(', ')}. Resolve every one of them.`
    : 'The changes applied without textual conflicts, but they may still interact in ways that break the code.';

  return [
    `The current working tree already contains the combined changes of ${jobs.length} background agent job(s), merged together for integration.`,
    conflictNote,
    '',
    'What each job was trying to accomplish:',
    '',
    goals,
    '',
    'Your task: reconcile everything into one coherent, correct result.',
    '- Resolve all git conflict markers if any are present.',
    '- Ensure the combined changes are logically consistent: no references to renamed or removed symbols, no duplicated or contradictory logic, no half-applied refactors across the merged edits.',
    "- Run the project's typecheck/build (and fast tests if available) and fix anything the merge broke.",
    '- Preserve every job\'s intent — integrate them all, do not drop or revert one to satisfy another.',
    'End with a short summary of how you combined them and anything you had to change to make them fit.',
  ].join('\n');
}

async function fireNotification(title, body) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') new Notification(title, { body });
    }
  } catch {
    // Notifications are best-effort.
  }
}

export function AgentJobsProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  // Files selected in the active tab's file tree, bridged up from ProjectTab
  // (which owns the tab-scoped FileSelectionProvider). Shape: [{relativePath, state}].
  const [selectedContextFiles, setSelectedContextFiles] = useState([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const registerContextFiles = useCallback((files) => {
    setSelectedContextFiles(Array.isArray(files) ? files : []);
  }, []);

  const patchJob = useCallback((id, updater) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...(typeof updater === 'function' ? updater(j) : updater) } : j))
    );
  }, []);

  // Persistence: the job list lives only in React state, but the backend keeps
  // running detached jobs (and its PID map) across a webview reload. Persist the
  // list to disk and rehydrate on mount so the panel survives reloads/restarts.
  const hydratedRef = useRef(false);
  const stateFileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const home = await invoke('get_home_dir');
        stateFileRef.current = `${home}/.lirah/jobs-state.json`;
        let saved = [];
        try {
          const raw = await invoke('read_file_content', { path: stateFileRef.current });
          saved = JSON.parse(raw) || [];
        } catch {
          saved = []; // First run or unreadable state — start empty.
        }
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

        const recovered = await Promise.all(
          saved.map(async (job) => {
            if (job.status !== 'running' || liveSet.has(job.id)) return job;
            // Process is gone (app was restarted, or it finished while detached).
            // Recover any changes from the worktree so review/discard still work.
            let changedFiles = [];
            try {
              const status = await invoke('run_git_command', {
                repoPath: job.cwd,
                args: ['status', '--porcelain'],
              });
              changedFiles = parsePorcelain(status, job.cwd);
            } catch {
              // Non-git cwd or the worktree is gone.
            }
            const worktreeGone = job.worktreePath
              ? !(await invoke('path_exists', { path: job.worktreePath }).catch(() => false))
              : true;
            const hasChanges = changedFiles.length > 0;
            const diffStat = !worktreeGone && hasChanges ? await computeDiffStat(job.cwd) : null;
            return {
              ...job,
              status: hasChanges ? 'done' : 'interrupted',
              changedFiles,
              diffStat,
              endedAt: job.endedAt || Date.now(),
              worktreePath: worktreeGone ? null : job.worktreePath,
              error: hasChanges ? job.error : 'Interrupted — recovered after the app was closed.',
            };
          })
        );

        if (!cancelled) setJobs(recovered);
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
  useEffect(() => {
    if (!hydratedRef.current || !stateFileRef.current) return;
    const file = stateFileRef.current;
    const timer = setTimeout(() => {
      invoke('write_file_content', { path: file, content: JSON.stringify(jobs) }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [jobs]);

  // Stream output + completion events from the backend.
  useEffect(() => {
    let unlistenOutput = null;
    let unlistenDone = null;
    let cancelled = false;

    const finalizeJob = async (job, exitCode, success) => {
      // A cancelled (or otherwise no-longer-running) job can still emit a backend
      // 'done' event when its process finally exits. Don't let that resurrect it
      // to 'done' or fire a spurious report + notification.
      const snapshot = jobsRef.current.find((j) => j.id === job.id);
      if (snapshot && snapshot.status !== 'running') return;
      let changedFiles = [];
      try {
        const status = await invoke('run_git_command', {
          repoPath: job.cwd,
          args: ['status', '--porcelain'],
        });
        changedFiles = parsePorcelain(status, job.cwd);
      } catch {
        // Non-git cwd or command failed — leave changedFiles empty.
      }
      const endedAt = Date.now();
      // Line-level diff stat, but only for isolated worktrees (never touch the
      // user's real index/working tree).
      const diffStat = job.worktreePath && changedFiles.length ? await computeDiffStat(job.cwd) : null;
      // Use the freshest job snapshot so the report captures the full output.
      const fresh = jobsRef.current.find((j) => j.id === job.id) || job;
      const reportPath = await writeJobReport(fresh, { changedFiles, success, exitCode, endedAt });
      patchJob(job.id, {
        status: success ? 'done' : 'failed',
        exitCode,
        changedFiles,
        diffStat,
        endedAt,
        reportPath,
      });
      fireNotification(
        success ? 'Agent job finished' : 'Agent job failed',
        `${job.label} — ${changedFiles.length} file(s) changed`
      );
    };

    (async () => {
      const uo = await listen('agent-job://output', (event) => {
        const { jobId, stream, chunk } = event.payload;
        patchJob(jobId, (j) => ({
          output: [...j.output, { stream, chunk }].slice(-MAX_OUTPUT_LINES),
        }));
      });
      const ud = await listen('agent-job://done', (event) => {
        const { jobId, exitCode, success } = event.payload;
        const job = jobsRef.current.find((j) => j.id === jobId);
        if (job) finalizeJob(job, exitCode, success);
      });
      if (cancelled) {
        uo();
        ud();
        return;
      }
      unlistenOutput = uo;
      unlistenDone = ud;
    })();

    return () => {
      cancelled = true;
      if (unlistenOutput) unlistenOutput();
      if (unlistenDone) unlistenDone();
    };
  }, [patchJob]);

  // Launch a background job. If useWorktree, run it in an isolated git worktree
  // so file changes stay quarantined until approved.
  const launchJob = useCallback(async ({ cli, prompt, label, repoPath, useWorktree = true, intendedFiles = [] }) => {
    const id = makeId();
    const home = await invoke('get_home_dir').catch(() => null);
    // Full output is mirrored here so it survives the in-memory cap and reloads.
    const logPath = home ? `${home}/.lirah/jobs-logs/${id}.log` : null;

    // Resolve the git repo root (works even when repoPath is a subdirectory).
    // Null means repoPath is not inside a git repo.
    let repoRoot = null;
    try {
      const top = await invoke('run_git_command', {
        repoPath,
        args: ['rev-parse', '--show-toplevel'],
      });
      repoRoot = top.trim() || null;
    } catch {
      repoRoot = null;
    }

    const targetRepo = repoRoot || repoPath;
    let cwd = targetRepo;
    let worktreePath = null;
    let error = null;

    if (useWorktree && !repoRoot) {
      // Worktree isolation requires a git repo — degrade to in-place with a note.
      error = 'Not a git repository — running in-place (no isolation or diff review).';
    } else if (useWorktree) {
      try {
        if (!home) throw new Error('home directory unavailable');
        worktreePath = `${home}/.lirah/worktrees/${basename(repoRoot)}-${id}`;
        await invoke('run_git_command', {
          repoPath: repoRoot,
          args: ['worktree', 'add', '--detach', worktreePath],
        });
        cwd = worktreePath;
      } catch (e) {
        // Fall back to running in-place if worktree creation fails.
        error = `Worktree unavailable, running in-place: ${e}`;
        worktreePath = null;
        cwd = targetRepo;
      }
    }

    const job = {
      id,
      cli,
      label,
      prompt,
      status: 'running',
      repoPath: targetRepo,
      cwd,
      worktreePath,
      useWorktree: !!worktreePath,
      // Files the user flagged as modifiable — used to warn when a later job's
      // scope overlaps this one's before it's even launched.
      intendedFiles: Array.isArray(intendedFiles) ? intendedFiles : [],
      output: [],
      changedFiles: [],
      exitCode: null,
      error,
      logPath,
      startedAt: Date.now(),
      endedAt: null,
    };
    setJobs((prev) => [job, ...prev]);

    try {
      await invoke('run_agent_job', { jobId: id, cli, prompt, cwd, logPath });
    } catch (e) {
      patchJob(id, { status: 'failed', error: String(e), endedAt: Date.now() });
    }
    return id;
  }, [patchJob]);

  const cancelJob = useCallback(async (id) => {
    try {
      await invoke('cancel_agent_job', { jobId: id });
    } catch {
      // Ignore — process may have already exited.
    }
    patchJob(id, { status: 'cancelled', endedAt: Date.now() });
  }, [patchJob]);

  // Apply a job's isolated worktree changes onto the current branch's working
  // tree. With `threeWay`, overlapping edits are merged and left with conflict
  // markers instead of hard-failing — the reconcile path relies on this so that
  // several jobs touching the same files can be combined. Throws on failure so
  // the caller can decide whether to keep the worktree around for inspection.
  const applyJobPatch = useCallback(async (job, { threeWay = false, targetRepo } = {}) => {
    const dest = targetRepo || job.repoPath;
    // Stage everything (incl. new files) and produce a full binary patch.
    await invoke('run_git_command', { repoPath: job.cwd, args: ['add', '-A'] });
    const patch = await invoke('run_git_command', {
      repoPath: job.cwd,
      args: ['diff', '--cached', '--binary'],
    });
    if (!patch.trim()) return;
    const home = await invoke('get_home_dir');
    const patchFile = `${home}/.lirah/patches/job-${job.id}.patch`;
    await invoke('write_file_content', { path: patchFile, content: patch });
    const applyArgs = ['apply', '--whitespace=nowarn'];
    if (threeWay) applyArgs.push('--3way');
    applyArgs.push(patchFile);
    await invoke('run_git_command', { repoPath: dest, args: applyArgs });
  }, []);

  // Apply a single job's worktree changes back onto the main repo working tree.
  // Gated on a typecheck of the isolated result: a job (or a reconcile result)
  // that doesn't type-check is blocked before it can touch the working tree,
  // unless the caller forces it through. This is the "don't trust per-worktree
  // green — verify the merged result" gate; for a reconcile job the worktree IS
  // the merged tree, so this checks exactly what will land.
  const approveJob = useCallback(async (id, { force = false } = {}) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job || !job.worktreePath) return { ok: false, error: 'No isolated changes to apply.' };
    let typecheck = null;
    try {
      if (!force) {
        patchJob(id, { typecheck: { status: 'checking' } });
        typecheck = await typecheckChangedFiles(job.changedFiles);
        patchJob(id, { typecheck });
        if (typecheck.errorCount > 0) {
          return { ok: false, blocked: true, typecheck, label: job.label };
        }
      }
      await applyJobPatch(job);
      await invoke('run_git_command', {
        repoPath: job.repoPath,
        args: ['worktree', 'remove', '--force', job.worktreePath],
      });
      patchJob(id, { status: 'applied', worktreePath: null });
      // A reconcile job supersedes its sources — tear their worktrees down and
      // drop them so their (now-integrated) changes can't be applied a second time.
      if (job.sourceJobIds?.length) {
        for (const srcId of job.sourceJobIds) {
          const src = jobsRef.current.find((j) => j.id === srcId);
          if (src?.worktreePath) {
            try {
              await invoke('run_git_command', {
                repoPath: src.repoPath,
                args: ['worktree', 'remove', '--force', src.worktreePath],
              });
            } catch {
              // Worktree already gone.
            }
          }
        }
        setJobs((prev) => prev.filter((j) => !job.sourceJobIds.includes(j.id)));
      }
      return { ok: true, label: job.label, typecheck, forced: force };
    } catch (e) {
      patchJob(id, { error: `Approve failed: ${e}` });
      return { ok: false, error: String(e), label: job.label };
    }
  }, [applyJobPatch, patchJob]);

  // Launch a fresh copy of a finished/failed job with the exact same prompt,
  // CLI and isolation — the common "tweak nothing, just run it again" path.
  const rerunJob = useCallback(async (id) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return null;
    return launchJob({
      cli: job.cli,
      prompt: job.prompt,
      label: job.label,
      repoPath: job.repoPath,
      useWorktree: job.useWorktree,
      intendedFiles: job.intendedFiles,
    });
  }, [launchJob]);

  // Semantically reconcile several finished jobs. Rather than blindly 3-way
  // merging into the working tree (which resolves text but not logic), we:
  //   1. spin up a dedicated integration worktree off the current branch,
  //   2. seed it by 3-way applying every selected job's patch (overlaps become
  //      conflict markers),
  //   3. launch a headless agent in that worktree to resolve conflicts, make the
  //      combined change coherent, and get the project building.
  // The result surfaces as an ordinary reviewable job the user can Review/Apply.
  // Returns { started, jobId } on success or { started:false, error }.
  const reconcileJobs = useCallback(async (ids) => {
    const idSet = new Set(ids);
    const targets = jobsRef.current.filter(
      (j) => idSet.has(j.id) && j.worktreePath && j.changedFiles.length > 0
    );
    if (targets.length === 0) return { started: false, error: 'No reconcilable jobs selected.' };

    // All jobs must share a repo to be integrated together.
    const repoRoot = targets[0].repoPath;
    if (targets.some((j) => j.repoPath !== repoRoot)) {
      return { started: false, error: 'Selected jobs belong to different repositories.' };
    }

    const home = await invoke('get_home_dir').catch(() => null);
    if (!home) return { started: false, error: 'Home directory unavailable.' };

    const id = makeId();
    const intPath = `${home}/.lirah/worktrees/reconcile-${basename(repoRoot)}-${id}`;
    try {
      await invoke('run_git_command', { repoPath: repoRoot, args: ['worktree', 'add', '--detach', intPath] });
    } catch (e) {
      return { started: false, error: `Could not create integration worktree: ${e}` };
    }

    // Detect files two or more jobs both touched BEFORE merging — a 3-way apply
    // can silently auto-merge overlapping hunks, so textual-conflict detection
    // alone under-reports collisions. This is the ground truth for "which jobs
    // stepped on each other", surfaced loudly rather than smoothed over.
    const touchedBy = new Map(); // repo-relative path -> [job labels]
    for (const job of targets) {
      for (const f of job.changedFiles) {
        const rel = relToRepo(job, f.path);
        if (!touchedBy.has(rel)) touchedBy.set(rel, []);
        touchedBy.get(rel).push(job.label);
      }
    }
    const overlaps = [...touchedBy.entries()]
      .filter(([, labels]) => labels.length > 1)
      .map(([path, labels]) => ({ path, labels }));

    // Seed the integration worktree with every job's changes. 3-way so overlaps
    // land as conflict markers for the agent to resolve instead of hard-failing.
    const conflicts = [];
    for (const job of targets) {
      try {
        await applyJobPatch(job, { threeWay: true, targetRepo: intPath });
      } catch {
        conflicts.push(job);
      }
    }

    // Mark the source jobs that couldn't apply cleanly so the user can see which
    // upstream jobs collided (the 'conflict' status is otherwise never set).
    if (conflicts.length) {
      const conflictIds = new Set(conflicts.map((j) => j.id));
      setJobs((prev) => prev.map((j) => (conflictIds.has(j.id) ? { ...j, status: 'conflict' } : j)));
    }

    const logPath = `${home}/.lirah/jobs-logs/${id}.log`;
    const prompt = buildReconcilePrompt(targets, conflicts);
    const job = {
      id,
      kind: 'reconcile',
      cli: 'claude',
      label: `Reconcile ${targets.length} job${targets.length === 1 ? '' : 's'}`,
      prompt,
      status: 'running',
      repoPath: repoRoot,
      cwd: intPath,
      worktreePath: intPath,
      useWorktree: true,
      output: [],
      changedFiles: [],
      exitCode: null,
      error: null,
      logPath,
      sourceJobIds: targets.map((t) => t.id),
      // Loud conflict record: files two+ jobs both edited, and jobs whose patch
      // wouldn't apply cleanly. Rendered on the card so nothing is smoothed over.
      overlaps,
      conflictLabels: conflicts.map((j) => j.label),
      startedAt: Date.now(),
      endedAt: null,
    };
    setJobs((prev) => [job, ...prev]);

    try {
      await invoke('run_agent_job', { jobId: id, cli: 'claude', prompt, cwd: intPath, logPath });
    } catch (e) {
      patchJob(id, { status: 'failed', error: String(e), endedAt: Date.now() });
      return { started: false, error: String(e) };
    }
    return {
      started: true,
      jobId: id,
      seededConflicts: conflicts.length,
      overlapCount: overlaps.length,
    };
  }, [applyJobPatch, patchJob]);

  // Archive: tuck a finished job out of the main list without losing anything —
  // worktree, report and log are untouched, so an archived job can still be
  // reviewed, applied or re-run later from the archived section.
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
    if (job?.worktreePath) {
      try {
        await invoke('run_git_command', {
          repoPath: job.repoPath,
          args: ['worktree', 'remove', '--force', job.worktreePath],
        });
      } catch {
        // Worktree may already be gone.
      }
    }
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  // Find existing jobs in the same repo whose scope (files they intend to touch,
  // or already changed) overlaps a prospective set of repo-relative paths. Used
  // to warn before launching a job that would collide with a pending one, so
  // overlap is partitioned away up front instead of reconciled after the fact.
  const findOverlappingJobs = useCallback((repoPath, relativePaths) => {
    if (!repoPath || !relativePaths?.length) return [];
    const want = new Set(relativePaths);
    const active = new Set(['running', 'done', 'interrupted', 'conflict']);
    const out = [];
    for (const job of jobs) {
      if (job.repoPath !== repoPath || !active.has(job.status)) continue;
      const scope = new Set([
        ...(job.intendedFiles || []),
        ...(job.changedFiles || []).map((f) => relToRepo(job, f.path)),
      ]);
      const files = [...want].filter((p) => scope.has(p));
      if (files.length) out.push({ id: job.id, label: job.label, status: job.status, files });
    }
    return out;
  }, [jobs]);

  const value = {
    jobs,
    launchJob,
    findOverlappingJobs,
    cancelJob,
    approveJob,
    rerunJob,
    reconcileJobs,
    discardJob,
    archiveJob,
    unarchiveJob,
    selectedContextFiles,
    registerContextFiles,
  };

  return <AgentJobsContext.Provider value={value}>{children}</AgentJobsContext.Provider>;
}

export function useAgentJobs() {
  const context = useContext(AgentJobsContext);
  if (context === undefined) {
    throw new Error('useAgentJobs must be used within an AgentJobsProvider');
  }
  return context;
}
