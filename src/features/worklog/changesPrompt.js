import { invoke } from '@tauri-apps/api/core';
import { load, save } from '../../lib/fileStore';
import { hash8 } from '../../lib/ids';
import { basename } from '../../utils/pathUtils';

// Changes (groupChanges) → a model's short title per change and a summary per
// feature, run by summarize_worklog. Replies are cached per repo and range in
// ~/.lirah/worklog/digests/<repo>-<hash8>/<from>_<to>.json, keyed per change by
// its id and turn count, so only new or grown changes are asked again.

const MAX_TITLE = 60;
const MAX_PROMPTS = 6;
const MAX_PROMPT = 300;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The cache key of one change: changes only grow, so id + turns spots an edit. */
export const changeKey = (c) => `${c.id}:${c.turns}`;

/** A feature's cache key: the keys of every change in it. */
export const featureKey = (changes) => hash8(changes.map(changeKey).sort().join(','));

/** The title a change gets when the model gives none: its first prompt, cut. */
export const fallbackTitle = (c) => cut(clean(c.prompts?.[0]) || 'untitled change', MAX_TITLE);

/** The digest file for `repo` (absolute path) between `from` and `to` ('YYYY-MM-DD'). */
export const digestFile = (repo, from, to) => `worklog/digests/${basename(repo) || 'repo'}-${hash8(repo)}/${from}_${to}.json`;

/** The prompt asking for titles of `changes` and summaries of the features they touch. */
export function buildChangesPrompt(changes) {
  const features = [...new Set(changes.map((c) => c.feature).filter(Boolean))];
  const block = (c) => {
    const prompts = c.prompts.slice(0, MAX_PROMPTS).map((p) => `  - ${cut(clean(p), MAX_PROMPT)}`);
    if (c.prompts.length > MAX_PROMPTS) prompts.push(`  - (+${c.prompts.length - MAX_PROMPTS} more prompts)`);
    const decisions = (c.decisions ?? []).map((d) => `  - ${clean(d)}`);
    return [
      `change ${c.id} | feature: ${c.feature ?? 'none'} | files: ${c.files.length}`,
      ' prompts:',
      ...prompts,
      ...(decisions.length ? [' decisions:', ...decisions] : []),
    ].join('\n');
  };
  return `Name the changes a developer made with Claude Code, and say what each feature gained.

Each change below is a run of prompts that built one thing, with the decisions recorded along the way. Use the prompts and decisions as evidence; don't invent work they don't show.

Reply with JSON only, no markdown fence, no other text:
{"changes":[{"id":"<change id>","title":"<title>"}],"features":[{"name":"<feature>","summary":"<summary>"}]}

- One entry per change, with its id exactly as given. Titles under ${MAX_TITLE} characters, as outcomes ("Row menu with code comments"), no trailing period.
- One entry per feature named below: ${features.length ? features.join(', ') : '(none)'}. Summaries are 1-2 plain sentences on what it gained.

${changes.map(block).join('\n\n')}
`;
}

/**
 * A model reply → { titles: { id: title }, summaries: { feature: summary } } for
 * `changes`. Bad JSON or a missing id falls back to fallbackTitle; summaries
 * the reply leaves out are omitted.
 */
export function parseChangesReply(text, changes) {
  let reply = null;
  try {
    const raw = String(text ?? '');
    reply = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); // tolerate a fence or stray words
  } catch {
    reply = null;
  }
  const given = new Map();
  for (const c of Array.isArray(reply?.changes) ? reply.changes : []) {
    const title = clean(c?.title);
    if (c?.id != null && title) given.set(String(c.id), cut(title, MAX_TITLE));
  }
  const titles = Object.fromEntries(changes.map((c) => [c.id, given.get(String(c.id)) ?? fallbackTitle(c)]));
  const summaries = {};
  for (const f of Array.isArray(reply?.features) ? reply.features : []) {
    const summary = clean(f?.summary);
    if (f?.name && summary) summaries[f.name] = summary;
  }
  return { titles, summaries };
}

/**
 * Titles for `changes` and summaries for their features, from the digest cache
 * or the model. Resolves { titles: { id: title }, summaries: { feature: summary } }.
 * A failed model call falls back to fallbackTitle and is not cached.
 */
export async function titleChanges(changes, { repo, from, to, model = 'haiku', projectDir }) {
  const rel = digestFile(repo, from, to);
  const doc = (await load(rel).catch(() => null)) ?? {};
  const cached = { titles: doc.titles ?? {}, features: doc.features ?? {} };

  const byFeature = new Map();
  for (const c of changes) if (c.feature) byFeature.set(c.feature, [...(byFeature.get(c.feature) ?? []), c]);
  const stale = new Set([...byFeature].filter(([id, cs]) => cached.features[id]?.key !== featureKey(cs)).map(([id]) => id));
  const ask = changes.filter((c) => !cached.titles[changeKey(c)] || stale.has(c.feature));

  if (ask.length) {
    let reply = null;
    try {
      reply = await invoke('summarize_worklog', { projectDir: projectDir || repo, prompt: buildChangesPrompt(ask), model });
    } catch (e) {
      console.error('Failed to title changes:', e);
    }
    if (reply != null) {
      const { titles, summaries } = parseChangesReply(reply, ask);
      // A fallback title is not cached, so the change is asked again next time.
      for (const c of ask) if (titles[c.id] !== fallbackTitle(c)) cached.titles[changeKey(c)] = titles[c.id];
      for (const id of stale) if (summaries[id]) cached.features[id] = { key: featureKey(byFeature.get(id)), summary: summaries[id] };
      await save(rel, { titles: cached.titles, features: cached.features }).catch((e) => console.error('Failed to cache change titles:', e));
    }
  }

  return {
    titles: Object.fromEntries(changes.map((c) => [c.id, cached.titles[changeKey(c)] ?? fallbackTitle(c)])),
    summaries: Object.fromEntries([...byFeature.keys()].filter((id) => cached.features[id]).map((id) => [id, cached.features[id].summary])),
  };
}
