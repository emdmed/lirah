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
    const outputText = job.output.map((o) => o.chunk).join('\n');

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

  // Stream output + completion events from the backend.
  useEffect(() => {
    let unlistenOutput = null;
    let unlistenDone = null;
    let cancelled = false;

    const finalizeJob = async (job, exitCode, success) => {
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
      // Use the freshest job snapshot so the report captures the full output.
      const fresh = jobsRef.current.find((j) => j.id === job.id) || job;
      const reportPath = await writeJobReport(fresh, { changedFiles, success, exitCode, endedAt });
      patchJob(job.id, {
        status: success ? 'done' : 'failed',
        exitCode,
        changedFiles,
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
  const launchJob = useCallback(async ({ cli, prompt, label, repoPath, useWorktree = true }) => {
    const id = makeId();

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
        const home = await invoke('get_home_dir');
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
      output: [],
      changedFiles: [],
      exitCode: null,
      error,
      startedAt: Date.now(),
      endedAt: null,
    };
    setJobs((prev) => [job, ...prev]);

    try {
      await invoke('run_agent_job', { jobId: id, cli, prompt, cwd });
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

  // Apply a job's worktree changes back onto the main repo working tree.
  const approveJob = useCallback(async (id) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job || !job.worktreePath) return;
    try {
      // Stage everything (incl. new files) and produce a full patch.
      await invoke('run_git_command', { repoPath: job.cwd, args: ['add', '-A'] });
      const patch = await invoke('run_git_command', {
        repoPath: job.cwd,
        args: ['diff', '--cached', '--binary'],
      });
      if (patch.trim()) {
        const home = await invoke('get_home_dir');
        const patchFile = `${home}/.lirah/patches/job-${id}.patch`;
        await invoke('write_file_content', { path: patchFile, content: patch });
        await invoke('run_git_command', {
          repoPath: job.repoPath,
          args: ['apply', '--whitespace=nowarn', patchFile],
        });
      }
      await invoke('run_git_command', {
        repoPath: job.repoPath,
        args: ['worktree', 'remove', '--force', job.worktreePath],
      });
      patchJob(id, { status: 'applied', worktreePath: null });
    } catch (e) {
      patchJob(id, { error: `Approve failed: ${e}` });
    }
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

  const value = {
    jobs,
    launchJob,
    cancelJob,
    approveJob,
    discardJob,
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
