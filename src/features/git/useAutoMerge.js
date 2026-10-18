import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

// Deterministic "finish this feature branch": switch to a base branch and merge
// the feature into it. Fast-forward when possible, else a --no-ff merge commit.
// Any doubt (dirty tree, operation in progress, conflict) refuses or aborts and
// puts you back where you were. No agent involved.
//
// run_git_command only fails when git writes to stderr, and some failures (a
// conflicted merge, --is-ancestor) exit non-zero silently — so every step is
// checked by reading the repo state back, never by trusting the call.

const PREFERRED_BASES = ['main', 'master', 'develop', 'dev'];
const LAST_BASE_KEY = 'lirah:auto-merge:last-base';

const git = (repoPath, ...args) => invoke('run_git_command', { repoPath, args });
const lines = (out) => out.split('\n').map(l => l.trim()).filter(Boolean);
const count = async (repoPath, range) => parseInt((await git(repoPath, 'rev-list', '--count', range)).trim(), 10) || 0;

// Tracked changes only — untracked files are left alone, and git itself refuses
// a switch that would overwrite one.
const isDirty = async (repoPath) => lines(await git(repoPath, 'status', '--porcelain', '--untracked-files=no')).length > 0;
const mergeInProgress = async (repoPath) => (await git(repoPath, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')).trim() !== '';
const currentBranch = async (repoPath) => (await git(repoPath, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();

// branch name -> worktree path, from `git worktree list --porcelain`.
async function worktreesByBranch(repoPath) {
  const map = {};
  let path = null;
  for (const line of lines(await git(repoPath, 'worktree', 'list', '--porcelain'))) {
    if (line.startsWith('worktree ')) path = line.slice(9);
    else if (line.startsWith('branch refs/heads/') && path) map[line.slice(18)] = path;
  }
  return map;
}

const readLastBase = (repoRoot) => {
  try { return JSON.parse(localStorage.getItem(LAST_BASE_KEY) || '{}')[repoRoot] || null; } catch { return null; }
};
const writeLastBase = (repoRoot, base) => {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_BASE_KEY) || '{}');
    all[repoRoot] = base;
    localStorage.setItem(LAST_BASE_KEY, JSON.stringify(all));
  } catch {}
};

export function useAutoMerge() {
  const [stage, setStage] = useState('idle'); // idle | checking | ready | merging | done | error
  const [feature, setFeature] = useState('');
  const [bases, setBases] = useState([]);
  const [base, setBaseState] = useState('');
  const [plan, setPlan] = useState(null); // { commits, files, ff, mergeDir, switchNeeded, featureWorktree }
  const [result, setResult] = useState(null); // { ff, notes }
  const [error, setError] = useState(null);
  const ctxRef = useRef(null); // { repoPath, repoRoot, worktrees }
  const planSeqRef = useRef(0);

  const reset = useCallback(() => {
    setStage('idle');
    setFeature('');
    setBases([]);
    setBaseState('');
    setPlan(null);
    setResult(null);
    setError(null);
  }, []);

  const fail = useCallback((msg) => {
    setError(msg);
    setStage('error');
  }, []);

  // Work out exactly what merging `featureName` into `baseName` would do.
  const buildPlan = useCallback(async (featureName, baseName) => {
    const { repoPath, worktrees } = ctxRef.current;
    const seq = ++planSeqRef.current;
    const [commits, files, behind] = await Promise.all([
      git(repoPath, 'log', '--oneline', '--no-decorate', `${baseName}..${featureName}`),
      git(repoPath, 'diff', '--name-status', `${baseName}...${featureName}`),
      count(repoPath, `${featureName}..${baseName}`),
    ]);
    if (seq !== planSeqRef.current) return;

    // Base already checked out in another worktree: git won't switch to it
    // here, so the merge runs there instead.
    const baseWorktree = worktrees[baseName];
    const mergeDir = baseWorktree && baseWorktree !== repoPath ? baseWorktree : repoPath;
    const featureWorktree = worktrees[featureName] && worktrees[featureName] !== repoPath
      ? worktrees[featureName]
      : null;

    setPlan({
      commits: lines(commits),
      files: lines(files).map(l => {
        const [status, ...rest] = l.split('\t');
        return { status: status[0], path: rest[rest.length - 1] };
      }),
      ff: behind === 0,
      mergeDir,
      switchNeeded: mergeDir === repoPath,
      featureWorktree,
      standingInFeatureWorktree: worktrees[featureName] === repoPath && repoPath !== ctxRef.current.repoRoot,
    });
  }, []);

  const trigger = useCallback(async (currentPath) => {
    if (!currentPath) return;
    reset();
    setStage('checking');
    try {
      const repoPath = (await git(currentPath, 'rev-parse', '--show-toplevel')).trim();
      if (!repoPath) return fail('Not a git repository');
      // The main worktree, so the remembered base is shared across worktrees.
      const commonDir = (await git(repoPath, 'rev-parse', '--path-format=absolute', '--git-common-dir')).trim();
      const repoRoot = commonDir.replace(/\/\.git\/?$/, '');

      const featureName = await currentBranch(repoPath);
      if (!featureName || featureName === 'HEAD') return fail('HEAD is detached — check out the feature branch first');
      setFeature(featureName);

      if (await mergeInProgress(repoPath)) return fail('A merge is already in progress here — finish or abort it first');
      if (await isDirty(repoPath)) return fail('Working tree has uncommitted changes — commit or stash them first');

      const all = lines(await git(repoPath, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'))
        .filter(b => b !== featureName);
      if (all.length === 0) return fail('No other local branch to merge into');
      const ordered = [
        ...PREFERRED_BASES.filter(b => all.includes(b)),
        ...all.filter(b => !PREFERRED_BASES.includes(b)),
      ];
      const last = readLastBase(repoRoot);
      const initial = last && ordered.includes(last) ? last : ordered[0];

      ctxRef.current = { repoPath, repoRoot, worktrees: await worktreesByBranch(repoPath) };
      setBases(ordered);
      setBaseState(initial);
      await buildPlan(featureName, initial);
      setStage('ready');
    } catch (err) {
      fail(err.toString());
    }
  }, [reset, fail, buildPlan]);

  const setBase = useCallback((name) => {
    setBaseState(name);
    setPlan(null);
    buildPlan(feature, name).catch(err => fail(err.toString()));
  }, [feature, buildPlan, fail]);

  const confirm = useCallback(async () => {
    if (stage !== 'ready' || !plan || plan.commits.length === 0) return;
    const { repoPath, repoRoot } = ctxRef.current;
    const { mergeDir, switchNeeded, featureWorktree } = plan;
    setStage('merging');

    let switched = false;
    // Put things back the way they were, then report.
    const rollback = async (msg) => {
      if (await mergeInProgress(mergeDir).catch(() => false)) {
        await git(mergeDir, 'merge', '--abort').catch(() => {});
      }
      if (switched) await git(repoPath, 'switch', feature).catch(() => {});
      fail(msg);
    };

    try {
      // Re-check: things may have changed while the dialog sat open.
      if (await isDirty(repoPath)) return fail('Working tree has uncommitted changes — commit or stash them first');
      if (mergeDir !== repoPath) {
        if (await isDirty(mergeDir)) return fail(`${base} is checked out in ${mergeDir} with uncommitted changes`);
        if (await mergeInProgress(mergeDir)) return fail(`A merge is already in progress in ${mergeDir}`);
      }

      // 1. Switch to the base branch.
      if (switchNeeded) {
        await git(repoPath, 'switch', base);
        switched = true;
        if (await currentBranch(repoPath) !== base) return rollback(`Could not switch to ${base}`);
      } else if (await currentBranch(mergeDir) !== base) {
        return fail(`${mergeDir} is no longer on ${base}`);
      }

      // 2. Merge.
      const ff = (await count(mergeDir, `${feature}..${base}`)) === 0;
      const output = ff
        ? await git(mergeDir, 'merge', '--ff-only', feature)
        : await git(mergeDir, 'merge', '--no-ff', '--no-edit', '-m', `Merge branch '${feature}' into ${base}`, feature);

      const conflicted = lines(await git(mergeDir, 'diff', '--name-only', '--diff-filter=U'));
      if (conflicted.length > 0 || await mergeInProgress(mergeDir)) {
        return rollback(`Merge conflict — aborted, nothing changed. Resolve in lazygit.\n\n${conflicted.join('\n') || output}`);
      }
      // Post-condition: base now contains every feature commit.
      if ((await count(mergeDir, `${base}..${feature}`)) !== 0) {
        return rollback(`Merge did not complete — aborted.\n\n${output}`);
      }

      writeLastBase(repoRoot, base);

      // 3. Remove the feature branch's worktree, if it lives in one.
      const notes = [];
      if (featureWorktree) {
        try {
          await git(mergeDir, 'worktree', 'remove', featureWorktree);
          notes.push(`Removed worktree ${featureWorktree}`);
        } catch (err) {
          notes.push(`Kept worktree ${featureWorktree}: ${err.toString().trim()}`);
        }
      } else if (plan.standingInFeatureWorktree) {
        notes.push(`This tab is inside the ${feature} worktree, so it was kept`);
      }

      setResult({ ff, notes });
      setStage('done');
    } catch (err) {
      await rollback(err.toString());
    }
  }, [stage, plan, base, feature, fail]);

  const cancel = useCallback(() => {
    if (stage === 'merging') return;
    planSeqRef.current++;
    reset();
  }, [stage, reset]);

  return { stage, feature, bases, base, setBase, plan, result, error, trigger, confirm, cancel };
}
