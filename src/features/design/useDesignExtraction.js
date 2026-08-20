import { useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  buildBranchExtractionPrompt,
  buildExtractionPrompt,
  buildRepairPrompt,
} from './designPrompt';
import { parseSpecJson, validateSpec, normalizeSpec } from './spec';
import { createEventLog } from './designEvents';

/**
 * Drives source → design spec.
 *
 *   1. resolve the source the caller picked — the current conversation, or this
 *      branch's diff against its base
 *   2. digest it in Rust (`build_session_digest` / `build_branch_digest`)
 *   3. run the extractor headless (`run_agent_job`) — it reads the digest, checks
 *      the repo, and writes spec JSON to a file
 *   4. validate; on failure run exactly one repair pass
 *   5. verify every `files` entry against disk and mark what is missing
 *
 * Only step 1 differs between the two sources: each produces digest text, a
 * description of itself for the UI, and the prompt that explains that flavour of
 * digest to the extractor. Everything downstream — the run directory, the job,
 * validation, the repair pass, git grounding — is shared, because the spec
 * schema is the same design either way.
 *
 * The extractor writes to a file rather than stdout because the runner's stdout
 * carries progress chatter, and because the repair pass needs something concrete
 * to rewrite.
 *
 * State lives here rather than in the dialog so closing the dialog mid-run does
 * not cancel the job — the run continues and the result is waiting on reopen.
 */

const STATUS_LABELS = {
  idle: '',
  digesting: 'Reading the conversation…',
  extracting: 'Designing the diagram…',
  repairing: 'Fixing the spec…',
  verifying: 'Checking against the repo…',
  ready: 'Ready',
  error: 'Failed',
};

/** How often to ask the backend whether the job is still alive. */
const WATCHDOG_INTERVAL_MS = 2_000;

/**
 * Absolute ceiling on one agent job. A real extraction runs 2-4 minutes; if
 * nothing has resolved by this point something is wrong, and failing with the log
 * path beats an indefinite spinner.
 */
const JOB_TIMEOUT_MS = 15 * 60_000;

/**
 * How much source the digest may carry.
 *
 * `standard` leaves the budget to Rust — sized so a normal feature fits whole
 * while the extractor keeps most of its context free to go and read the repo.
 * `full` is for the branch the standard budget clips: a wide refactor, a
 * multi-week feature, a conversation of several hundred turns. It costs tokens
 * and minutes, which is why it is a deliberate choice rather than the default.
 *
 * `null` means "no override", so the Rust default stays the single source of
 * truth for what standard means.
 */
export const DIGEST_DEPTHS = {
  standard: { label: 'Standard', chars: null, hint: 'about 175k tokens of source' },
  full: { label: 'Full', chars: 2_000_000, hint: 'up to ~500k tokens — slower, costs more' },
};

const digestBudget = (depth) => DIGEST_DEPTHS[depth]?.chars ?? null;

/** Told only when there is somewhere left to go — at full depth there is not. */
const retryHint = (depth) =>
  depth === 'full' ? ' This was already the full digest, so the rest is genuinely too large.'
    : ' Regenerate with digest depth “Full” to include more of it.';

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const basename = (p) => p.replace(/\/+$/, '').split('/').pop() || 'repo';

export function useDesignExtraction() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [logPath, setLogPath] = useState(null);
  const [spec, setSpec] = useState(null);
  const [warnings, setWarnings] = useState([]);
  /** Did the digest this spec was drawn from leave source out? */
  const [truncated, setTruncated] = useState(false);
  const [source, setSource] = useState(null);
  const [runDir, setRunDir] = useState(null);

  // The activity log is a store, not state: it moves several times a second and
  // this hook lives in the composer panel, which must not re-render for it.
  const eventLogRef = useRef(null);
  if (!eventLogRef.current) eventLogRef.current = createEventLog();

  const jobIdRef = useRef(null);
  const cancelledRef = useRef(false);
  const stagesRef = useRef([]);
  const pipelineLogRef = useRef(null);

  // There is deliberately no "is still mounted" guard here. The previous version
  // kept one and cleared it in an effect cleanup — which StrictMode invokes on
  // mount (mount → cleanup → mount), leaving the flag permanently false and
  // silently swallowing every `setSpec`/`setStatus('ready')` call. Runs completed
  // correctly and the UI sat at "Checking against the repo…" forever. Setting
  // state after unmount is a no-op in React 18+, so the guard bought nothing and
  // cost three failed runs.

  /**
   * Record a pipeline stage: into the activity feed, and appended to
   * `pipeline.log` in the run directory.
   *
   * The agent's own stream says nothing about the steps around it — resolving the
   * session, digesting, validating, verifying, publishing. When a run appears
   * stuck, knowing which of those it reached is the whole diagnosis, and having
   * it on disk means it can be read after the fact without the app running.
   */
  const stage = useCallback(async (label, detail = '', level) => {
    const line = `${new Date().toISOString()}  ${label}${detail ? `  ${detail}` : ''}`;
    stagesRef.current.push(line);
    eventLogRef.current.push(JSON.stringify({ type: 'lirah_stage', label, detail, level }));
    if (pipelineLogRef.current) {
      try {
        await invoke('write_file_content', {
          path: pipelineLogRef.current,
          content: `${stagesRef.current.join('\n')}\n`,
        });
      } catch {
        // Losing the on-disk copy must never break the run.
      }
    }
  }, []);

  /**
   * Run one headless job to completion.
   *
   * `listen` is itself an async IPC round trip, so both listeners must be fully
   * registered *before* the process is spawned — otherwise a job that finishes
   * immediately (a missing CLI exits 127 in milliseconds) emits `done` into the
   * void and the caller waits forever.
   *
   * Even with correct ordering an event can be lost to a webview hiccup, so a
   * watchdog polls the backend's own list of running jobs: once the id is gone,
   * the job is over whether or not its event arrived. Belt and braces, because
   * the failure mode is a UI stuck at "working" with nothing to show.
   */
  const runJob = useCallback(async ({ jobId, cli, prompt, cwd, logPath }) => {
    let unOut = null;
    let unDone = null;
    let watchdog = null;

    // Registered before the spawn, so nothing is missed.
    let settle;
    const done = new Promise((resolve) => {
      settle = resolve;
    });

    unOut = await listen('agent-job://output', (event) => {
      if (event.payload?.jobId !== jobId) return;
      // One event carries a coalesced batch of lines.
      for (const line of event.payload.lines || []) {
        eventLogRef.current.push(line.chunk || '');
      }
    });
    unDone = await listen('agent-job://done', (event) => {
      if (event.payload?.jobId !== jobId) return;
      settle({ exitCode: event.payload.exitCode, success: event.payload.success });
    });

    try {
      jobIdRef.current = jobId;
      await invoke('run_agent_job', { jobId, cli, prompt, cwd, logPath, streamJson: true });

      watchdog = setInterval(async () => {
        try {
          const running = await invoke('list_running_agent_jobs');
          if (!running.includes(jobId)) {
            // The backend has forgotten the job, so it has exited. The exit code
            // only reaches us via the event; the caller falls back to inspecting
            // whether the spec file was written.
            settle({ exitCode: null, success: null, viaWatchdog: true });
          }
        } catch {
          // Transient IPC failure — the next tick tries again.
        }
      }, WATCHDOG_INTERVAL_MS);

      let timeout;
      const expired = new Promise((resolve) => {
        timeout = setTimeout(() => resolve({ exitCode: null, success: null, timedOut: true }), JOB_TIMEOUT_MS);
      });
      try {
        return await Promise.race([done, expired]);
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      eventLogRef.current.flushNow();
      jobIdRef.current = null;
      if (watchdog) clearInterval(watchdog);
      if (unOut) unOut();
      if (unDone) unDone();
    }
  }, []);

  /**
   * Mark every node's files that are not on disk.
   *
   * One batched call for the whole spec: a per-file invoke meant hundreds of
   * sequential IPC round trips, each one a hop through the main thread.
   */
  const verifyFiles = useCallback(async (parsed, projectPath) => {
    const nodes = parsed.nodes || [];
    const unique = [...new Set(nodes.flatMap((n) => n.files || []))];
    if (unique.length === 0) {
      for (const node of nodes) node.filesMissing = [];
      return parsed;
    }

    let found;
    try {
      found = await invoke('paths_exist', { paths: unique, root: projectPath });
    } catch {
      // Verification is an enhancement, not a gate — a failure here must not
      // cost the user the diagram, so treat everything as unverified-but-present.
      for (const node of nodes) node.filesMissing = [];
      return parsed;
    }

    const exists = new Map(unique.map((p, i) => [p, found[i]]));
    for (const node of nodes) {
      node.filesMissing = (node.files || []).filter((f) => !exists.get(f));
    }
    return parsed;
  }, []);

  /**
   * Decide, per node, whether this work added it, modified it, or left it alone.
   *
   * Read off git rather than trusted from the extractor: a node is `added` when
   * every file it owns is new on this branch, `modified` when any of them
   * changed, and `untouched` when none did. Nodes with no files (or files git
   * knows nothing about) keep whatever the extractor claimed — which is why the
   * source is recorded on the node, so the UI can be honest about it.
   *
   * `baseRef` is the base the user chose. It must be the same one the digest was
   * built from, or the colouring would contradict the diff that produced it.
   */
  const classifyChanges = useCallback(async (parsed, projectPath, baseRef = null) => {
    const nodes = parsed.nodes || [];
    const unique = [...new Set(nodes.flatMap((n) => n.files || []))];
    if (unique.length === 0) return parsed;

    let classes;
    try {
      classes = await invoke('paths_change_status', {
        paths: unique,
        root: projectPath,
        baseRef,
      });
    } catch {
      return parsed; // Grounding is an enhancement — never a gate on the diagram.
    }

    const byPath = new Map(unique.map((p, i) => [p, classes[i]]));
    for (const node of nodes) {
      const files = node.files || [];
      const known = files
        .map((f) => byPath.get(f))
        .filter((c) => c === 'added' || c === 'modified' || c === 'untouched');

      node.filesChanged = Object.fromEntries(
        files.map((f) => [f, byPath.get(f) || 'unknown'])
      );

      if (known.length === 0) {
        node.changeSource = 'spec';
        continue;
      }
      node.changeSource = 'git';
      // All-new files means the part itself is new; a mix means it existed and
      // grew, which is exactly the "modified" the reader cares about.
      node.change = known.every((c) => c === 'added')
        ? 'added'
        : known.some((c) => c === 'added' || c === 'modified')
          ? 'modified'
          : 'untouched';
    }
    return parsed;
  }, []);

  /**
   * Shared tail of both paths (fresh extraction and loading a stored run):
   * verify the spec's file references, normalize, and publish to state.
   */
  const publish = useCallback(
    async (
      parsed,
      projectPath,
      baseWarnings = [],
      { truncated = false, truncationWarning, baseRef = null } = {}
    ) => {
      const fileCount = (parsed.nodes || []).reduce((a, n) => a + (n.files || []).length, 0);
      const verified = await verifyFiles(parsed, projectPath);
      const missingCount = (verified.nodes || []).reduce((a, n) => a + (n.filesMissing?.length || 0), 0);
      await stage('Files verified', `${fileCount} referenced · ${missingCount} not found`);
      if (cancelledRef.current) return false;

      await classifyChanges(verified, projectPath, baseRef);
      const changed = (verified.nodes || []).filter(
        (n) => n.change === 'added' || n.change === 'modified'
      );
      await stage(
        'Change state resolved',
        `${changed.filter((n) => n.change === 'added').length} added · ${
          changed.filter((n) => n.change === 'modified').length
        } modified`
      );
      if (cancelledRef.current) return false;

      const unverified = (verified.nodes || []).filter(
        (n) => (n.status || 'existing') === 'existing' && n.filesMissing?.length
      );
      const allWarnings = [...baseWarnings];
      if (unverified.length) {
        allWarnings.push(
          `${unverified.length} node(s) marked existing reference files that are not on disk — see the amber markers.`
        );
      }
      if (truncated && truncationWarning) {
        allWarnings.push(truncationWarning);
      }
      // Kept as a flag as well as a sentence: the chrome offers a one-click
      // re-run at full depth, and matching on warning text to decide that would
      // break the first time the wording changed.
      setTruncated(!!truncated);

      setWarnings(allWarnings);
      setSpec(normalizeSpec(verified));
      setStatus('ready');
      return true;
    },
    [verifyFiles, classifyChanges, stage]
  );

  /** Path to this project's designs directory. */
  const designsDirFor = useCallback(async (projectPath) => {
    const home = await invoke('get_home_dir');
    return `${home}/.lirah/designs/${basename(projectPath)}`;
  }, []);

  /** Is there a stored run to offer? Used to decide whether to show the option. */
  const probeStoredRun = useCallback(
    async ({ projectPath }) => {
      if (!projectPath) return false;
      try {
        const designsDir = await designsDirFor(projectPath);
        return !!(await invoke('latest_design_run', { designsDir }));
      } catch {
        return false;
      }
    },
    [designsDirFor]
  );

  /**
   * Load the most recent stored run for this project instead of extracting
   * again. Extraction costs minutes and tokens, so a spec already on disk should
   * never have to be regenerated just to be looked at.
   */
  const loadLastRun = useCallback(
    async ({ projectPath }) => {
      if (!projectPath) return false;
      try {
        const designsDir = await designsDirFor(projectPath);
        const specPath = await invoke('latest_design_run', { designsDir });
        if (!specPath) return false;

        cancelledRef.current = false;
        setError(null);
        setStatus('verifying');
        const raw = await invoke('read_file_content', { path: specPath });
        const parsed = parseSpecJson(raw);
        const result = validateSpec(parsed);
        if (!result.ok) {
          throw new Error(
            `The stored spec at ${specPath} is not valid — regenerate to replace it.`
          );
        }
        setSource(null);
        setRunDir(specPath.replace(/\/spec\.json$/, ''));
        await publish(parsed, projectPath, [
          ...result.warnings,
          'Loaded from a previous run — regenerate to pick up newer conversation.',
        ]);
        return true;
      } catch (e) {
        setError(e.message || String(e));
        setStatus('error');
        return false;
      }
    },
    [publish, designsDirFor]
  );

  /**
   * Resolve + digest the active Claude session. Returns the digest text, a
   * description of the source for the UI, and the prompt that reads it.
   */
  const prepareConversation = useCallback(
    async ({ projectPath, depth = 'standard' }) => {
      const entry = await invoke('get_active_claude_session', { projectPath });
      if (!entry) {
        throw new Error(
          'No Claude Code session found for this project yet. Have a conversation first, then try again.'
        );
      }
      await stage(
        'Session resolved',
        `${entry.session_id.slice(0, 8)} · ${entry.message_count} messages`
      );

      // projectPath lets the digest speak in repo-relative paths — the same
      // terms the spec asks for, and what the verification pass resolves.
      const digest = await invoke('build_session_digest', {
        sessionPath: entry.full_path,
        projectPath,
        maxChars: digestBudget(depth),
      });
      if (!digest.digest?.trim() || digest.message_count === 0) {
        throw new Error('That session has no conversation content to diagram.');
      }
      await stage(
        'Digest built',
        `${digest.message_count} messages · ${Math.round(digest.chars / 1024)} KB · ${depth} depth${
          digest.truncated ? ' · truncated' : ''
        }`
      );

      const sourceLabel = `session ${entry.session_id} (${digest.message_count} messages${
        digest.truncated ? ', older ones omitted' : ''
      })`;

      return {
        digest: digest.digest,
        truncated: digest.truncated,
        truncationWarning: `The conversation was long; older messages were omitted from the digest.${retryHint(depth)}`,
        // No base was chosen, so git grounding auto-detects one as it always has.
        classifyBase: null,
        source: {
          kind: 'conversation',
          sessionId: entry.session_id,
          firstPrompt: entry.first_prompt || '(no prompt recorded)',
          modified: entry.modified,
          messageCount: entry.message_count,
          path: entry.full_path,
        },
        buildPrompt: ({ digestPath, outPath }) =>
          buildExtractionPrompt({ digestPath, outPath, repoPath: projectPath, sourceLabel }),
      };
    },
    [stage]
  );

  /** As `prepareConversation`, but for what this branch changed. */
  const prepareBranch = useCallback(
    async ({ projectPath, baseRef, depth = 'standard' }) => {
      // Rust raises a readable error for "not a repo", "no base found" and
      // "nothing changed" — those are the three ways this source is unusable and
      // each one tells the user what to do instead, so they pass straight through.
      const digest = await invoke('build_branch_digest', {
        projectPath,
        baseRef: baseRef || null,
        maxChars: digestBudget(depth),
      });
      await stage('Branch resolved', `${digest.branch} vs ${digest.base} (${digest.base_sha})`);
      await stage(
        'Digest built',
        `${digest.commit_count} commits · ${digest.file_count} files · ${Math.round(
          digest.chars / 1024
        )} KB · ${depth} depth${digest.truncated ? ' · patches clipped' : ''}`
      );

      return {
        digest: digest.digest,
        truncated: digest.truncated,
        truncationWarning: `The branch diff was large; some patches were clipped or omitted from the digest.${retryHint(depth)}`,
        // The base git *resolved*, not the one asked for: an override that did not
        // resolve fell back to detection, and the colouring must follow the digest.
        classifyBase: digest.base,
        source: {
          kind: 'branch',
          branch: digest.branch,
          base: digest.base,
          baseSha: digest.base_sha,
          commitCount: digest.commit_count,
          fileCount: digest.file_count,
          dirtyCount: digest.dirty_count,
        },
        buildPrompt: ({ digestPath, outPath }) =>
          buildBranchExtractionPrompt({
            digestPath,
            outPath,
            repoPath: projectPath,
            branch: digest.branch,
            base: digest.base,
          }),
      };
    },
    [stage]
  );

  /**
   * What the conversation source would cover. Same contract as
   * `probeBranchSource`: cheap, never throws, and an unusable source explains
   * itself so the picker can grey it out with a reason instead of failing a run.
   */
  const probeConversationSource = useCallback(async ({ projectPath } = {}) => {
    if (!projectPath) return { available: false, reason: 'No project folder open.' };
    try {
      const entry = await invoke('get_active_claude_session', { projectPath });
      if (!entry) {
        return {
          available: false,
          reason: 'No Claude Code session recorded for this project yet.',
        };
      }
      return {
        available: entry.message_count > 0,
        reason: entry.message_count > 0 ? null : 'That session has no messages yet.',
        sessionId: entry.session_id,
        messageCount: entry.message_count,
        firstPrompt: entry.first_prompt || '',
        modified: entry.modified,
      };
    } catch (e) {
      return { available: false, reason: e.message || String(e) };
    }
  }, []);

  /**
   * The branches this repo could be compared against, newest tip first, with the
   * auto-detected one marked. Never throws — no repo comes back as an empty list.
   */
  const listBaseChoices = useCallback(async ({ projectPath } = {}) => {
    if (!projectPath) return { detected: null, current: null, refs: [] };
    try {
      return await invoke('list_base_choices', { projectPath });
    } catch {
      return { detected: null, current: null, refs: [] };
    }
  }, []);

  /**
   * What the branch source would cover, for the picker to show before the user
   * commits to a run. Never throws — an unusable source comes back as
   * `available: false` with a reason.
   */
  const probeBranchSource = useCallback(async ({ projectPath, baseRef } = {}) => {
    if (!projectPath) return { available: false, reason: 'No project folder open.' };
    try {
      return await invoke('branch_diff_summary', { projectPath, baseRef: baseRef || null });
    } catch (e) {
      return { available: false, reason: e.message || String(e) };
    }
  }, []);

  const generate = useCallback(
    async ({
      projectPath,
      cli = 'claude',
      sourceKind = 'conversation',
      baseRef = null,
      depth = 'standard',
    }) => {
      if (!projectPath) {
        setError('No project path — open a folder first.');
        setStatus('error');
        return;
      }
      cancelledRef.current = false;
      setError(null);
      setWarnings([]);
      setTruncated(false);
      setSpec(null);
      eventLogRef.current.reset();
      stagesRef.current = [];
      pipelineLogRef.current = null;
      setStartedAt(Date.now());
      setStatus('digesting');

      try {
        // --- 1 + 2. resolve and digest whichever source the user picked ---
        const prepared =
          sourceKind === 'branch'
            ? await prepareBranch({ projectPath, baseRef, depth })
            : await prepareConversation({ projectPath, depth });
        setSource(prepared.source);

        const home = await invoke('get_home_dir');
        const dir = `${home}/.lirah/designs/${basename(projectPath)}/${stamp()}`;
        const digestPath = `${dir}/digest.md`;
        const specPath = `${dir}/spec.json`;
        const logPath = `${dir}/extract.log`;
        setRunDir(dir);
        setLogPath(logPath);
        pipelineLogRef.current = `${dir}/pipeline.log`;
        await invoke('write_file_content', { path: digestPath, content: prepared.digest });
        await stage('Run directory', dir);

        if (cancelledRef.current) return;

        // --- 3. extract ---
        setStatus('extracting');
        await stage('Extractor starting', `cli=${cli} · source=${prepared.source.kind}`);
        const extractResult = await runJob({
          jobId: `design-${Date.now()}`,
          cli,
          prompt: prepared.buildPrompt({ digestPath, outPath: specPath }),
          cwd: projectPath,
          logPath,
        });
        await stage(
          'Extractor finished',
          extractResult.timedOut
            ? `timed out after ${JOB_TIMEOUT_MS / 60000} min`
            : extractResult.exitCode === null
              ? 'process gone (detected by watchdog)'
              : `exit ${extractResult.exitCode}`,
          extractResult.timedOut ? 'warn' : undefined
        );
        if (cancelledRef.current) return;

        const readSpec = async () => {
          const raw = await invoke('read_file_content', { path: specPath });
          return parseSpecJson(raw);
        };

        let parsed;
        try {
          parsed = await readSpec();
        } catch (e) {
          // No spec file means the job failed. Its exit code is the most useful
          // clue — 127 is a missing CLI, which is the likeliest first-run problem.
          const exit = extractResult.exitCode;
          const hint =
            exit === 127
              ? ` The "${cli}" command was not found on PATH.`
              : exit === null
                ? ' The job ended without reporting an exit code.'
                : '';
          throw new Error(
            `The extractor did not produce a usable spec${
              exit === null ? '' : ` (exit ${exit})`
            }: ${e.message}.${hint} Full output: ${logPath}`
          );
        }

        await stage('Spec read', `${(parsed.nodes || []).length} nodes`);

        // --- 4. validate, with one repair pass ---
        let result = validateSpec(parsed);
        if (!result.ok) {
          await stage('Spec invalid — repairing', `${result.errors.length} errors`, 'warn');
          setStatus('repairing');
          await runJob({
            jobId: `design-repair-${Date.now()}`,
            cli,
            prompt: buildRepairPrompt({ outPath: specPath, errors: result.errors }),
            cwd: projectPath,
            logPath,
          });
          if (cancelledRef.current) return;
          parsed = await readSpec();
          result = validateSpec(parsed);
          if (!result.ok) {
            const summary = result.errors
              .slice(0, 5)
              .map((e) => `${e.path || '(root)'}: ${e.message}`)
              .join('; ');
            throw new Error(
              `Spec still invalid after one repair attempt — ${summary}${
                result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ''
              }. Raw spec: ${specPath}`
            );
          }
        }

        await stage('Spec valid');

        // --- 5. verify against disk ---
        setStatus('verifying');
        // Report what actually happened: an earlier version logged "Diagram
        // ready" unconditionally, so a publish that bailed still looked like a
        // success in the log — which is precisely the trail needed to diagnose it.
        const published = await publish(parsed, projectPath, result.warnings, {
          truncated: prepared.truncated,
          truncationWarning: prepared.truncationWarning,
          baseRef: prepared.classifyBase,
        });
        await stage(
          published ? 'Diagram ready' : 'Cancelled before publishing',
          '',
          published ? undefined : 'warn'
        );
      } catch (e) {
        const message = e.message || String(e);
        await stage('Failed', message, 'warn');
        if (cancelledRef.current) return;
        setError(message);
        setStatus('error');
      }
    },
    [runJob, publish, stage, prepareConversation, prepareBranch]
  );

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    const jobId = jobIdRef.current;
    if (jobId) {
      try {
        await invoke('cancel_agent_job', { jobId });
      } catch {
        // Job already gone — nothing to cancel.
      }
    }
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    setSpec(null);
    setError(null);
    setWarnings([]);
    setTruncated(false);
    setStatus('idle');
  }, []);

  const isRunning = ['digesting', 'extracting', 'repairing', 'verifying'].includes(status);

  return {
    status,
    statusLabel: STATUS_LABELS[status] || '',
    isRunning,
    eventLog: eventLogRef.current,
    startedAt,
    logPath,
    error,
    spec,
    warnings,
    truncated,
    source,
    runDir,
    generate,
    loadLastRun,
    probeStoredRun,
    probeConversationSource,
    probeBranchSource,
    listBaseChoices,
    cancel,
    reset,
  };
}
