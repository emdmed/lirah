import { git, gitLines } from '../../lib/git';
import { isReleaseBumpFile } from './releaseFiles';

// Changes (groupChanges) + git: which commits carried each change, how many
// lines they moved in its files, and the release that shipped it. Parsing is
// split from the git calls so tests feed it plain strings.

const REL_FORMAT = '%(refname:short)%09%(creatordate:unix)%09%(*committerdate:unix)%09%(committerdate:unix)';
const LOG_FORMAT = '%x1e%H%x09%ct%x09%s';
const RELEASE_SUBJECT = /^chore: release\b/;

/** for-each-ref lines → [{ tag, at }] (ms of the tagged commit), oldest first. */
export function parseReleases(lines) {
  return lines
    .map((l) => {
      const [tag, , peeled, own] = l.split('\t');
      return { tag, at: Number(peeled || own) * 1000 };
    })
    .filter((r) => r.tag && r.at)
    .sort((a, b) => a.at - b.at);
}

/** `git log --numstat --format=LOG_FORMAT` output → [{ sha, at, subject, files: { path: [added, removed] } }], oldest first, release bumps dropped. */
export function parseCommits(text) {
  const commits = [];
  for (const block of text.split('\x1e').slice(1)) {
    const [head, ...rest] = block.split('\n');
    const [sha, ct, ...subject] = head.split('\t');
    const files = {};
    for (const line of rest) {
      const [added, removed, path] = line.split('\t');
      // Binary files show '-' for both counts; they still mark the commit as touching the file.
      if (path) files[path] = [Number(added) || 0, Number(removed) || 0];
    }
    const c = { sha, at: Number(ct) * 1000, subject: subject.join('\t'), files };
    const paths = Object.keys(files);
    if (RELEASE_SUBJECT.test(c.subject) || (paths.length && paths.every(isReleaseBumpFile))) continue;
    commits.push(c);
  }
  return commits.sort((a, b) => a.at - b.at);
}

/**
 * Adds { commits: [sha], added, removed, lines, version, noCommit } to each change. A change's
 * commits are those after its start, up to the next release, that touch its
 * files; lines counts only its files in them; version is the first tag at or
 * after its last commit. Mutates and returns `changes`.
 */
export function attachGit(changes, { releases = [], commits = [] }) {
  for (const ch of changes) {
    const files = new Set(ch.files);
    const cutoff = releases.find((r) => r.at >= ch.start)?.at ?? Infinity;
    const mine = commits.filter((c) => c.at >= ch.start && c.at <= cutoff && Object.keys(c.files).some((f) => files.has(f)));
    ch.commits = mine.map((c) => c.sha);
    ch.added = 0;
    ch.removed = 0;
    for (const c of mine) for (const [f, [a, r]] of Object.entries(c.files)) if (files.has(f)) { ch.added += a; ch.removed += r; }
    ch.lines = ch.added + ch.removed;
    const last = mine.at(-1)?.at;
    ch.version = last == null ? null : (releases.find((r) => r.at >= last)?.tag ?? null);
    ch.noCommit = files.size > 0 && mine.length === 0;
  }
  return changes;
}

export const loadReleases = async (root) =>
  parseReleases(await gitLines(root, ['for-each-ref', '--sort=creatordate', `--format=${REL_FORMAT}`, 'refs/tags']));

// `${root} ${head} ${since}` -> Promise<commits>. Keyed by HEAD's sha, so a new
// commit makes a new key; a failed load is dropped so it can retry.
const commitsByRange = new Map();

/** Non-release commits on HEAD since `since` (ms), with numstat. Cached per range. */
export async function loadCommits(root, since) {
  const head = (await git(root, ['rev-parse', 'HEAD'])).trim();
  const key = `${root} ${head} ${since}`;
  let pending = commitsByRange.get(key);
  if (!pending) {
    const args = ['log', '--numstat', '--no-renames', `--since=@${Math.floor(since / 1000)}`, `--format=${LOG_FORMAT}`, head];
    pending = git(root, args)
      .then(parseCommits)
      .catch(() => {
        commitsByRange.delete(key);
        return [];
      });
    commitsByRange.set(key, pending);
  }
  return pending;
}
