// Prompts the plans feature sends to an agent, and parsing of what comes back.

import { isMultiRepo, isNoGit, planGit, workPath } from './planGit';
import { CHUNK_STATUS } from './planModel';

// Each chunk's commits carry this trailer, so they can be found in the log no
// matter what else lands on the branch meanwhile.
export function chunkTrailer(plan, chunk) {
  return `Plan-Chunk: ${plan.id}/${chunk.id}`;
}

// Plan-level review fixes belong to no chunk, so they get a pseudo-chunk id.
export function planFixTrailer(plan) {
  return `Plan-Chunk: ${plan.id}/review`;
}

export function chunkCommitMessage(plan, chunk) {
  return `plan(${plan.slug}): ${chunk.n} — ${chunk.title}`;
}

// Up to 30 characters, cut at a word boundary so a branch never ends mid-word
// (clear-the-eval-floors, not clear-the-eval-floo).
export function slugify(text) {
  const slug = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= 30) return slug || 'plan';
  const cut = slug.slice(0, 31);
  const end = cut.lastIndexOf('-');
  return (end > 0 ? cut.slice(0, end) : slug.slice(0, 30)).replace(/-+$/, '') || 'plan';
}

/** First `# heading` of a markdown document, if any. */
/** A draft plan: a `<topic>_plan/` folder of .md files beside the `<topic>_plan.md` files. */
export const DRAFT_DIR = /_plan$/;
export const isDraftPath = (path) => DRAFT_DIR.test(String(path).replace(/\/+$/, ''));

export function markdownTitle(source) {
  const m = String(source || '').match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/** `done`: chunks already finished (a re-chunk of a started plan); only the rest is split. */
export function buildSplitPrompt(source, done = []) {
  return `You are splitting an implementation plan into small, ordered chunks. A coding agent will implement each chunk on its own and commit it, so every chunk must be one coherent, reviewable change.

You may read the codebase (Read, Grep, Glob) to size the chunks correctly. Do not modify anything.

Rules:
- One chunk = one commit, ideally well under 300 changed lines. Split anything bigger.
- Order the chunks so each builds on the earlier ones and leaves the project working.
- Keep the plan's intent and scope. Don't add work it doesn't ask for.
- "details": concrete instructions for the agent: what to change, where, which existing code to reuse.
- "files": the files the chunk most likely touches (repo-relative), or [] if unsure.
- "acceptance": how to tell the chunk is done.

Reply with ONLY a JSON object, no markdown fences, no commentary:
{"title": string, "summary": string (1-3 sentences), "chunks": [{"title": string, "goal": string, "details": string, "files": [string], "acceptance": string}]}

The plan:
<plan>
${source}
</plan>${done.length ? `

These chunks are already implemented or skipped. Don't repeat them: return only the work the plan still needs on top of them.
${done.map((c) => `- ${c.n}. ${c.title}`).join('\n')}` : ''}`;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** The split agent's reply → { title, summary, chunks }. Throws when unusable. */
export function parseSplitResult(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The splitter returned no JSON');
  let data;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    throw new Error(`The splitter returned invalid JSON: ${e.message}`);
  }
  const chunks = (Array.isArray(data?.chunks) ? data.chunks : [])
    .map((c) => ({
      title: str(c?.title),
      goal: str(c?.goal),
      details: str(c?.details),
      files: Array.isArray(c?.files) ? c.files.filter((f) => typeof f === 'string' && f.trim()) : [],
      acceptance: str(c?.acceptance),
    }))
    .filter((c) => c.title);
  if (chunks.length === 0) throw new Error('The splitter returned no chunks');
  return { title: str(data.title), summary: str(data.summary), chunks };
}

function chunkBody(chunk) {
  return [
    chunk.goal && `Goal: ${chunk.goal}`,
    chunk.details && `Details:\n${chunk.details}`,
    chunk.files?.length > 0 && `Likely files: ${chunk.files.join(', ')}`,
    chunk.acceptance && `Done when: ${chunk.acceptance}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// Where the work goes when the plan spans several repos; nothing for one repo.
function reposBlock(plan) {
  const cfg = planGit(plan);
  if (cfg.repos.length < 2) return null;
  const branch = cfg.branch ? ` on branch ${cfg.branch}` : '';
  const rows = cfg.repos.map((r) => `- ${workPath(r)}${branch}`);
  return `This plan spans ${cfg.repos.length} git repositories:\n${rows.join('\n')}\nWork in these folders only. Commit separately in each repository you change, each commit with the message and trailer below.`;
}

/** The marker kind an agent ends its reply with when a chunk needed no commit. */
export const STATUS_DONE = 'done';

// Decisions a chunk made that later chunks should follow. The agent writes them
// as `Decision:` lines in its commit body (or its reply, when there is no
// commit); they are read back and put into every later chunk's prompt.
const DECISION_RE = /^\s*[-*]?\s*Decision:\s*(.+?)\s*$/i;

/** The `Decision:` lines of a commit body or reply, without the prefix, in order, deduplicated. */
export function parseDecisions(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(DECISION_RE);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

const DECISIONS_INSTRUCTION = `Between the message and the trailer, add one -m "Decision: <one line>" per choice a later chunk should know about: names, file locations, approaches you picked or rejected and why. Skip anything obvious from the code; add none if there's nothing worth passing on.`;

// The newest chunks show every decision; older ones show only their first few.
const RECENT_CHUNKS = 5;
const OLD_CHUNK_LINES = 3;

/**
 * Decisions and results of the implemented chunks before `upTo` (all of them
 * when null), for a later prompt. `listAll` also lists the chunks with
 * nothing to pass on, so the block doubles as the "already implemented" list.
 * Null when there is nothing to show.
 */
function decisionsBlock(plan, upTo = null, { listAll = false } = {}) {
  // A chunk at or after `upTo` (one implemented before a re-run of an earlier
  // chunk) is only listed: its decisions don't bind the chunks before it.
  const passes = (c) => upTo == null || c.n < upTo;
  const earlier = plan.chunks.filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED
    && (listAll || (passes(c) && (c.decisions?.length > 0 || c.result))));
  if (earlier.length === 0) return null;
  const parts = earlier.map((c, i) => {
    const lines = passes(c) ? [...(c.decisions ?? [])] : [];
    if (passes(c) && c.result) lines.push(`(result) ${c.result}`);
    const old = i < earlier.length - RECENT_CHUNKS && lines.length > OLD_CHUNK_LINES;
    const shown = old ? [...lines.slice(0, OLD_CHUNK_LINES), `… ${lines.length - OLD_CHUNK_LINES} more`] : lines;
    return [`  ${c.n}. ${c.title}`, ...shown.map((l) => `     - ${l}`)].join('\n');
  });
  const head = listAll ? 'Already implemented, with their decisions' : 'Decisions from earlier chunks';
  return `${head} (follow these unless this chunk says otherwise):\n${parts.join('\n')}`;
}

// `allowDone`: the chunk itself, which may need no file changes (a check, a
// test run); not a fix, which always changes something.
function commitInstruction(plan, chunk, { allowDone = false } = {}) {
  if (isNoGit(plan)) {
    return `This folder isn't a git repository: don't run git or commit. When the chunk is done and working, end your reply with a line
PLAN-STATUS: ${STATUS_DONE} — <one line on what you did>
Just above it, add one line "Decision: <one line>" per choice a later chunk should know about: names, file locations, approaches you picked or rejected and why. Skip anything obvious from the code; add none if there's nothing worth passing on.`;
  }
  return [
    `When it's done and working, commit only the files you changed for it, with exactly this message and trailer:
git commit -m "${chunkCommitMessage(plan, chunk).replace(/"/g, "'")}" -m "${chunkTrailer(plan, chunk)}"`,
    DECISIONS_INSTRUCTION,
    // A plan of several repos already says so in reposBlock.
    !isMultiRepo(plan) && 'If you change files in another git repository, commit there too, with the same message and trailer.',
    allowDone && `If the chunk needs no file changes (a check, a test run, an investigation), don't make an empty commit. End your reply with a line
PLAN-STATUS: ${STATUS_DONE} — <one line on what you did or found>
Put any Decision: lines just above it.`,
  ].filter(Boolean).join('\n');
}

// Under auto-pilot nobody is watching, so the agent says when it is stuck
// instead of guessing; the last PLAN-STATUS line of its reply is read back.
const STATUS_INSTRUCTION = `Nobody is watching this run. If you need a decision from the user before you can finish, don't guess: stop and end your reply with a line
PLAN-STATUS: needs-input — <your question>
If you can't proceed (a failure you can't fix, something missing), end your reply with a line
PLAN-STATUS: blocked — <reason>`;

export function buildChunkPrompt(plan, chunk, { autopilot = false } = {}) {
  const active = plan.chunks.filter((c) => c.status !== CHUNK_STATUS.SKIPPED);
  const later = active.filter((c) => c.n > chunk.n && c.status !== CHUNK_STATUS.IMPLEMENTED);
  const list = (cs) => cs.map((c) => `  ${c.n}. ${c.title}`).join('\n');
  return [
    `Implement chunk ${chunk.n} of ${plan.chunks.length} of the plan "${plan.title}".`,
    plan.summary && `Plan summary: ${plan.summary}`,
    decisionsBlock(plan, chunk.n, { listAll: true }),
    later.length > 0 && `Coming later (don't do these now):\n${list(later)}`,
    reposBlock(plan),
    `## Chunk ${chunk.n}: ${chunk.title}\n\n${chunkBody(chunk)}`,
    `Only do this chunk. ${commitInstruction(plan, chunk, { allowDone: true })}`,
    autopilot && STATUS_INSTRUCTION,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function noteLines(notes) {
  return notes.map((n) => {
    const range = n.toLine && n.toLine !== n.fromLine ? `${n.fromLine}-${n.toLine}` : `${n.fromLine}`;
    const snippet = n.snippet
      ? `\n${n.snippet.split('\n').map((l) => `   > ${l}`).join('\n')}`
      : '';
    return `- ${n.relPath}:${range} — ${n.note}${snippet}`;
  }).join('\n');
}

/** Review notes on an implemented chunk → a prompt to fix them in a new commit. */
export function buildFixPrompt(plan, chunk, notes) {
  return [
    `Review notes on chunk ${chunk.n} ("${chunk.title}") of the plan "${plan.title}", which is already committed.`,
    `## Chunk ${chunk.n}: ${chunk.title}\n\n${chunkBody(chunk)}`,
    decisionsBlock(plan, chunk.n),
    reposBlock(plan),
    `Review notes (${notes.length}):\n${noteLines(notes)}`,
    `Address every note. Don't revert unrelated work. ${commitInstruction(plan, chunk)}`,
  ].filter(Boolean).join('\n\n');
}

/** Auto-pilot's one follow-up when the agent stopped without committing. */
export function buildNudgePrompt(plan, chunk) {
  return [
    `Chunk ${chunk.n} ("${chunk.title}") of the plan "${plan.title}" ${isNoGit(plan) ? "isn't marked done yet" : "isn't committed yet"}. Finish it if anything is left.`,
    reposBlock(plan),
    commitInstruction(plan, chunk, { allowDone: true }),
    STATUS_INSTRUCTION,
  ].filter(Boolean).join('\n\n');
}

/** The last `PLAN-STATUS:` line of an agent's reply → { kind, message }, or null. */
export function parseStatusMarker(text) {
  const lines = String(text || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/PLAN-STATUS:\s*(needs-input|blocked|done)\b\s*[—–:-]*\s*(.*)$/i);
    if (m) return { kind: m[1].toLowerCase(), message: m[2].replace(/[`*]+$/, '').trim() };
  }
  return null;
}

/** Review notes on the whole plan's diff → a prompt to fix them in one commit. */
export function buildPlanFixPrompt(plan, notes) {
  const message = `plan(${plan.slug}): review fixes`;
  return [
    `Review notes on the plan "${plan.title}", which is fully implemented and committed.`,
    plan.summary && `Plan summary: ${plan.summary}`,
    decisionsBlock(plan),
    reposBlock(plan),
    `Review notes (${notes.length}):\n${noteLines(notes)}`,
    `Address every note. Don't revert unrelated work. When it's done and working, commit only the files you changed, with exactly this message:\ngit commit -m "${message.replace(/"/g, "'")}" -m "${planFixTrailer(plan)}"`,
  ].filter(Boolean).join('\n\n');
}

/** Your change requests for the plan's file, which the agent edits and nothing else. */
export function buildPlanRevisePrompt(plan, notes, path) {
  const done = plan.chunks.filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED || c.status === CHUNK_STATUS.SKIPPED);
  return [
    `Revise the implementation plan "${plan.title}" in ${path}.`,
    done.length > 0 && `Already done (${done.length} of ${plan.chunks.length} chunks), keep it as done and build on it:\n${done.map((c) => `- ${c.n}. ${c.title} (${c.status})`).join('\n')}`,
    decisionsBlock(plan),
    `Changes I want:\n${notes.trim()}`,
    isDraftPath(path)
      ? `Edit only the .md files in the draft folder ${path} (add or remove files as needed). Don't implement anything and don't commit. I'll re-chunk the plan from the folder once you're done.`
      : `Edit only ${path}. Don't implement anything and don't commit. I'll re-chunk the plan from the file once you're done.`,
  ].filter(Boolean).join('\n\n');
}

/**
 * A backlog task → a prompt asking the agent to plan it. `context` is the
 * user's plan context (which skill or approach to use); the plan is saved at
 * `planPath`, where the plans pane finds it and offers to import it.
 */
export function buildTaskPlanPrompt({ task, context, planPath, autoChunk = false }) {
  const draft = isDraftPath(planPath);
  return [
    context?.trim(),
    `## Task\n\n${task.title.trim()}${task.notes?.trim() ? `\n\n${task.notes.trim()}` : ''}`,
    draft
      ? `Write the plan as a draft folder at ${planPath}: one markdown file per concern, e.g. architecture.md, feature.md, qa.md (add or drop files as the work needs). Start plan.md, or the first file by name, with a \`# Title\` line. The files are joined into one plan in name order, plan.md first.`
      : `Save the finished plan as markdown at ${planPath}, starting with a \`# Title\` line.`,
    autoChunk && `Write ${draft ? 'those files' : 'that file'} only once the plan is final: it is picked up as soon as you end your turn and split into implementation chunks.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The parts a draft is written in, one file each, in planning mode, in the order "draft all" writes them. */
export const DRAFT_PARTS = Object.freeze([
  { id: 'architecture', label: 'architecture', note: 'design and decisions', about: 'the overall design: components, data flow, boundaries and the main decisions with their trade-offs' },
  { id: 'ui', label: 'ui', note: 'screens and states', about: 'screens, components, states (empty, loading, error) and interactions' },
  { id: 'backend', label: 'backend', note: 'services and APIs', about: 'services, APIs, commands and background work: endpoints, contracts, errors' },
  { id: 'database', label: 'database', note: 'schema and migrations', about: 'the data: schema, migrations, indexes, how existing data is kept or moved' },
  { id: 'qa', label: 'qa', note: 'tests and acceptance', about: 'how the work is checked: acceptance criteria per part, the tests to add (unit, integration, end to end), edge cases and the manual checks before it ships' },
]);

// A published Claude artifact's link, as ui.md carries its mockup's.
const ARTIFACT_LINK = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[\w-]+/;

/** Whether ui.md's text links its mockup artifact (the draft's gate when a mockup was asked for). */
export const hasMockupLink = (text) => ARTIFACT_LINK.test(text || '');

/**
 * One part of a draft folder → a prompt asking the agent to write only that
 * part's file. `existing` is the folder's other .md file names, read as context.
 */
export function buildDraftPartPrompt({ title, folder, part, existing = [], mockup = false }) {
  if (!part) throw new Error('a draft part needs a name');
  // A part beyond the four is one the user named: its file is all it says.
  const spec = DRAFT_PARTS.find((p) => p.id === part) || { label: part, about: `the ${part.replace(/_/g, ' ')} side of the plan` };
  const file = `${folder}/${part}.md`;
  const others = existing.filter((n) => n !== `${part}.md`);
  return [
    `Draft the ${spec.label} part of the plan "${title}".`,
    others.length > 0 && `Read the draft's other files in ${folder} first and stay consistent with them: ${others.join(', ')}.`,
    `Write ${file} (create the folder if needed): ${spec.about}. Start it with a \`# \` heading. Explore the codebase as needed, ask me if something is unclear, and keep it to this part.`,
    mockup && part === 'ui' && 'Make the mockup now, as part of this draft: an HTML artifact of the UI described, published, with its claude.ai link on the line under ui.md\'s heading. The draft can\'t be approved until ui.md links it, and the chunks won\'t build it later.',
    `Edit only ${file}. Don't implement anything and don't commit.`,
  ].filter(Boolean).join('\n\n');
}

/**
 * The opinionated draft: every part in one prompt, in DRAFT_PARTS order, so
 * each file builds on the ones before it. A part with nothing to say still
 * gets its file, saying so, so the draft always has the same shape.
 */
export function buildDraftAllPrompt({ title, folder, existing = [], mockup = false }) {
  const parts = DRAFT_PARTS.map((p, i) => `${i + 1}. ${folder}/${p.id}.md: ${p.about}.`);
  return [
    `Draft the whole plan "${title}" as ${DRAFT_PARTS.length} files in ${folder}, written in this order, each one consistent with the ones before it:`,
    parts.join('\n'),
    existing.length > 0 && `The folder already has ${existing.join(', ')}: read them first and build on them; rewrite a part only where it is wrong.`,
    'First explore the codebase, then ask me the questions you need answered before writing (scope, constraints, trade-offs), one batch at a time. Start each file with a `# ` heading. If a part has nothing to do for this work, still write its file with one line saying why.',
    mockup && 'In ui.md, make the mockup now: an HTML artifact of the UI described, published, with its claude.ai link on the line under ui.md\'s heading. The draft can\'t be approved until ui.md links it.',
    `Edit only the .md files in ${folder}. Don't implement anything and don't commit.`,
  ].filter(Boolean).join('\n\n');
}
