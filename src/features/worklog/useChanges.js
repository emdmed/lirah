import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { load, save } from '../../lib/fileStore';
import { useFeatureMap } from '../feature-map/useFeatureMap';
import { usePlans } from '../plans/PlansContext';
import { useSetting } from '../settings/settingsStore';
import { useWorklog } from './worklogStore';
import { groupChanges } from './changes';
import { attachGit, loadCommits, loadReleases } from './changesGit';
import { titleChanges } from './changesPrompt';
import { reviewState } from './reviewState';

const ANSWERS = 'worklog/answers.json';
const withAnswer = (doc, key, a) => {
  const { version, revision, ...next } = doc ?? {};
  if (a) next[key] = a; else delete next[key];
  return next;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOf = (key) => new Date(`${key}T00:00`).getTime(); // local midnight

/** The 7 days ending on `now`'s day, as { from, to } ('YYYY-MM-DD', local). */
export function weekRange(now = Date.now()) {
  return { from: ymd(new Date(now - 6 * DAY_MS)), to: ymd(new Date(now)) };
}

/**
 * The changes of `projectPath`'s repo in `range` ({ from, to }, both days in),
 * grouped by feature, biggest first. Grouping waits for git, so the list draws
 * once with versions and lines; titles and summaries fill in after (`titling`).
 * → { repo, loading, titling, features: [{ id, name, changes, turns, added, removed, versions, summary }],
 *     changes, titles, talk, unmapped, releases, fm, review, answer(key, s), unanswer(key) }
 * review is reviewState's { key: state } for the flags and assumptions of `changes`.
 */
export function useChanges(projectPath, range) {
  const { entries, repo } = useWorklog(projectPath);
  const fm = useFeatureMap(projectPath);
  const { plans } = usePlans(repo);
  const [model] = useSetting('worklogSummaryModel');
  const fromMs = startOf(range.from);
  const toMs = startOf(range.to) + DAY_MS;

  const [git, setGit] = useState(null); // { key, releases, commits }
  const gitKey = `${repo} ${fromMs}`;
  useEffect(() => {
    if (!repo) return undefined;
    let live = true;
    Promise.all([loadReleases(repo).catch(() => []), loadCommits(repo, fromMs).catch(() => [])])
      .then(([releases, commits]) => live && setGit({ key: gitKey, releases, commits }));
    return () => { live = false; };
  }, [repo, fromMs, gitKey]);

  const grouped = useMemo(() => {
    if (!entries || !repo || git?.key !== gitKey) return null;
    const mine = entries.filter((e) => e.repo === repo && e.at >= fromMs && e.at < toMs);
    const g = groupChanges(mine, { featureMap: fm.map });
    attachGit(g.changes, { ...git, plans: plans ?? [] });
    return { ...g, releases: git.releases.filter((r) => r.at >= fromMs && r.at < toMs) };
  }, [entries, repo, git, gitKey, fromMs, toMs, fm.map, plans]);

  const [digest, setDigest] = useState(null); // { of: grouped, titles, summaries }
  useEffect(() => {
    if (!grouped?.changes.length) return undefined;
    let live = true;
    titleChanges(grouped.changes, { repo, from: range.from, to: range.to, model })
      .then((d) => live && setDigest({ of: grouped, ...d }))
      .catch((e) => console.error('Failed to title changes:', e));
    return () => { live = false; };
  }, [grouped, repo, range.from, range.to, model]);

  const features = useMemo(() => {
    if (!grouped) return [];
    const names = new Map((fm.map?.features ?? []).map((f) => [f.id, f.name || f.id]));
    const byId = new Map();
    for (const c of grouped.changes) {
      const f = byId.get(c.feature) ?? { id: c.feature, name: names.get(c.feature) ?? 'No feature', changes: [], turns: 0, added: 0, removed: 0, versions: [] };
      byId.set(c.feature, f);
      f.changes.push(c);
      f.turns += c.turns;
      f.added += c.added;
      f.removed += c.removed;
      if (c.version && !f.versions.includes(c.version)) f.versions.push(c.version);
    }
    const size = (f) => f.added + f.removed || f.turns;
    return [...byId.values()]
      .map((f) => ({ ...f, summary: digest?.summaries[f.id] ?? null })) // a regroup keeps the last digest until the next lands
      .sort((a, b) => size(b) - size(a));
  }, [grouped, fm.map, digest]);

  const [answers, setAnswers] = useState({});
  const answersRef = useRef(answers); // save's updater gets no doc on its first try, only after a conflict
  useEffect(() => {
    load(ANSWERS, {}).then((doc) => setAnswers((answersRef.current = withAnswer(doc)))).catch((e) => console.error('Failed to read answers:', e));
  }, []);
  const mark = useCallback((key, a) => {
    setAnswers((answersRef.current = withAnswer(answersRef.current, key, a)));
    save(ANSWERS, (cur) => (cur ? withAnswer(cur, key, a) : answersRef.current)).catch((e) => console.error('Failed to save answers:', e));
  }, []);
  const answer = useCallback((key, s) => mark(key, { s, at: Date.now() }), [mark]);
  const unanswer = useCallback((key) => mark(key, null), [mark]);
  const review = useMemo(() => reviewState(grouped?.changes ?? [], entries ?? [], answers), [grouped, entries, answers]);

  const titled = digest?.of === grouped;
  return {
    repo,
    fm,
    loading: !grouped,
    titling: !!grouped?.changes.length && !titled,
    features,
    changes: grouped?.changes ?? [],
    titles: digest?.titles ?? {},
    talk: grouped?.talk ?? {},
    unmapped: grouped?.unmapped ?? [],
    releases: grouped?.releases ?? [],
    review,
    answer,
    unanswer,
  };
}
