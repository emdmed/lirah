// Prompts the plans feature sends to an agent, and parsing of what comes back.

// Each chunk's commits carry this trailer, so they can be found in the log no
// matter what else lands on the branch meanwhile.
export function chunkTrailer(plan, chunk) {
  return `Plan-Chunk: ${plan.id}/${chunk.id}`;
}

export function chunkCommitMessage(plan, chunk) {
  return `plan(${plan.slug}): ${chunk.n} — ${chunk.title}`;
}

export function slugify(text) {
  return (
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30)
      .replace(/-+$/, '') || 'plan'
  );
}

/** First `# heading` of a markdown document, if any. */
export function markdownTitle(source) {
  const m = String(source || '').match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

export function buildSplitPrompt(source) {
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
</plan>`;
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

function commitInstruction(plan, chunk) {
  return `When it's done and working, commit only the files you changed for it, with exactly this message and trailer:
git commit -m "${chunkCommitMessage(plan, chunk).replace(/"/g, "'")}" -m "${chunkTrailer(plan, chunk)}"`;
}

// Under auto-pilot nobody is watching, so the agent says when it is stuck
// instead of guessing; the last PLAN-STATUS line of its reply is read back.
const STATUS_INSTRUCTION = `Nobody is watching this run. If you need a decision from the user before you can finish, don't guess: stop and end your reply with a line
PLAN-STATUS: needs-input — <your question>
If you can't proceed (a failure you can't fix, something missing), end your reply with a line
PLAN-STATUS: blocked — <reason>`;

export function buildChunkPrompt(plan, chunk, { autopilot = false } = {}) {
  const active = plan.chunks.filter((c) => c.status !== 'skipped');
  const done = active.filter((c) => c.status === 'implemented');
  const later = active.filter((c) => c.n > chunk.n && c.status !== 'implemented');
  const list = (cs) => cs.map((c) => `  ${c.n}. ${c.title}`).join('\n');
  return [
    `Implement chunk ${chunk.n} of ${plan.chunks.length} of the plan "${plan.title}".`,
    plan.summary && `Plan summary: ${plan.summary}`,
    done.length > 0 && `Already implemented:\n${list(done)}`,
    later.length > 0 && `Coming later (don't do these now):\n${list(later)}`,
    `## Chunk ${chunk.n}: ${chunk.title}\n\n${chunkBody(chunk)}`,
    `Only do this chunk. ${commitInstruction(plan, chunk)}`,
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
    `Review notes (${notes.length}):\n${noteLines(notes)}`,
    `Address every note. Don't revert unrelated work. ${commitInstruction(plan, chunk)}`,
  ].join('\n\n');
}

/** Auto-pilot's one follow-up when the agent stopped without committing. */
export function buildNudgePrompt(plan, chunk) {
  return [
    `Chunk ${chunk.n} ("${chunk.title}") of the plan "${plan.title}" isn't committed yet. Finish it if anything is left.`,
    commitInstruction(plan, chunk),
    STATUS_INSTRUCTION,
  ].join('\n\n');
}

/** The last `PLAN-STATUS:` line of an agent's reply → { kind, message }, or null. */
export function parseStatusMarker(text) {
  const lines = String(text || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/PLAN-STATUS:\s*(needs-input|blocked)\b\s*[—–:-]*\s*(.*)$/i);
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
    `Review notes (${notes.length}):\n${noteLines(notes)}`,
    `Address every note. Don't revert unrelated work. When it's done and working, commit only the files you changed, with exactly this message:\ngit commit -m "${message.replace(/"/g, "'")}"`,
  ].filter(Boolean).join('\n\n');
}
