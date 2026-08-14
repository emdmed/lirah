/**
 * Parse the extractor's `--output-format stream-json` NDJSON into a flat activity
 * log, and hold that log in a store the dialog can subscribe to.
 *
 * Why a store rather than React state in the hook: the hook is mounted in the
 * composer panel, so putting a fast-moving event stream in its state would
 * re-render the whole editor several times a second for the length of the run.
 * The dialog subscribes directly instead, and the panel above it never re-renders.
 *
 * Event shapes were taken from a real `claude -p --output-format stream-json
 * --verbose` run rather than from docs:
 *
 *   {type:"system", subtype:"init", model, tools, cwd, session_id}
 *   {type:"system", subtype:"hook_started"|"hook_response", hook_name, hook_event, ...}
 *   {type:"assistant", message:{content:[{type:"text"|"tool_use", ...}], usage:{...}}}
 *   {type:"user", message:{content:[{type:"tool_result", ...}]}}
 *   {type:"rate_limit_event", ...}
 *   {type:"result", subtype:"success", duration_ms, num_turns, total_cost_usd, is_error}
 */

/** Keep the log bounded; a long run emits thousands of events. */
export const MAX_EVENTS = 400;

/** Coalesce bursts into one notification so subscribers re-render at most this often. */
const FLUSH_MS = 350;

const firstLine = (text, max = 120) => {
  const line = String(text).trim().split('\n')[0];
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/**
 * The identifying argument of a tool call — the same idea as the Rust digest's
 * `tool_target`, so the activity feed reads like the transcript.
 */
function toolTarget(input) {
  if (!input || typeof input !== 'object') return '';
  for (const key of ['file_path', 'path', 'notebook_path', 'pattern', 'url']) {
    if (typeof input[key] === 'string' && input[key]) return input[key];
  }
  if (typeof input.command === 'string') return firstLine(input.command, 80);
  if (typeof input.description === 'string') return firstLine(input.description, 80);
  return '';
}

/**
 * Turn one NDJSON line into zero or more activity entries.
 *
 * A non-JSON line is not dropped: the runner mixes stderr into the same stream,
 * and a stray warning or crash message is exactly what someone debugging a slow
 * run needs to see.
 *
 * @returns {Array<{kind: string, label: string, detail: string, level?: string, stats?: object}>}
 */
export function parseStreamLine(line) {
  const text = (line || '').trim();
  if (!text) return [];

  if (!text.startsWith('{')) {
    return [{ kind: 'raw', label: firstLine(text, 160), detail: '' }];
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return [{ kind: 'raw', label: firstLine(text, 160), detail: '' }];
  }

  const type = json.type;

  // Synthetic events the pipeline injects for its own stages. The agent's stream
  // only covers the agent — a stall in the digest, validation or verification
  // steps was previously invisible, which is exactly the case that is hardest to
  // diagnose from the outside.
  if (type === 'lirah_stage') {
    return [
      {
        kind: json.level === 'warn' ? 'stage-warn' : 'stage',
        label: json.label || 'stage',
        detail: json.detail || '',
        level: json.level,
      },
    ];
  }

  if (type === 'system') {
    if (json.subtype === 'init') {
      return [
        {
          kind: 'init',
          label: `Started ${json.model || 'model'}`,
          detail: `${(json.tools || []).length} tools · ${json.permissionMode || 'default'} mode`,
        },
      ];
    }
    // Hooks are worth surfacing: a repo whose hooks inject extra work is a
    // common reason a run takes far longer than expected.
    if (json.subtype === 'hook_started') {
      return [{ kind: 'hook', label: `Hook ${json.hook_name || ''}`.trim(), detail: json.hook_event || '' }];
    }
    if (json.subtype === 'hook_response') {
      const failed = typeof json.exit_code === 'number' && json.exit_code !== 0;
      return [
        {
          kind: 'hook',
          label: `Hook ${json.hook_name || ''} ${failed ? 'failed' : 'done'}`.trim(),
          detail: failed ? firstLine(json.stderr || json.stdout || '', 100) : '',
          level: failed ? 'warn' : undefined,
        },
      ];
    }
    return [];
  }

  if (type === 'assistant') {
    const blocks = json.message?.content || [];
    const entries = [];
    for (const block of blocks) {
      if (block.type === 'tool_use') {
        const target = toolTarget(block.input);
        entries.push({
          kind: 'tool',
          label: block.name || 'tool',
          detail: target,
        });
      } else if (block.type === 'text' && block.text?.trim()) {
        entries.push({ kind: 'say', label: firstLine(block.text, 140), detail: '' });
      }
    }
    // Deliberately not summing `message.usage`: in streaming mode it reports
    // per-chunk values (observed as output_tokens: 1 on every message), so any
    // running total from it would be nonsense. The final `result` event carries
    // the real duration, turn count and cost.
    return entries;
  }

  if (type === 'user') {
    const blocks = json.message?.content || [];
    const results = blocks.filter((b) => b.type === 'tool_result');
    if (!results.length) return [];
    const errored = results.some((r) => r.is_error);
    return errored
      ? [{ kind: 'tool-error', label: 'Tool returned an error', detail: '', level: 'warn' }]
      : [{ kind: 'tool-done', label: 'done', detail: '' }];
  }

  if (type === 'rate_limit_event') {
    // These arrive routinely with status "allowed" — it is a quota report, not a
    // throttle. Only surface it when the status is actually something else,
    // otherwise a healthy run looks like it is in trouble.
    const info = json.rate_limit_info || {};
    if (info.status === 'allowed') return [];
    return [
      {
        kind: 'rate-limit',
        label: `Rate limit: ${info.status || 'unknown'}`,
        detail: info.rateLimitType || '',
        level: 'warn',
      },
    ];
  }

  if (type === 'result') {
    const seconds = json.duration_ms ? (json.duration_ms / 1000).toFixed(0) : '?';
    const cost = typeof json.total_cost_usd === 'number' ? `$${json.total_cost_usd.toFixed(2)}` : '';
    return [
      {
        kind: 'result',
        label: json.is_error ? 'Finished with an error' : 'Finished',
        detail: [`${seconds}s`, `${json.num_turns ?? '?'} turns`, cost].filter(Boolean).join(' · '),
        level: json.is_error ? 'warn' : undefined,
        stats: {
          done: true,
          durationMs: json.duration_ms,
          turns: json.num_turns,
          costUsd: json.total_cost_usd,
          isError: !!json.is_error,
        },
      },
    ];
  }

  return [];
}

/**
 * Append-only activity log with throttled notification.
 *
 * `getSnapshot` returns a stable reference between flushes so it can back
 * `useSyncExternalStore` without tearing.
 */
export function createEventLog() {
  let events = [];
  let pending = [];
  let listeners = new Set();
  let timer = null;
  let counters = { tools: 0, turns: 0, costUsd: null };
  let snapshot = { events, counters, seq: 0 };
  let seq = 0;

  const flush = () => {
    timer = null;
    if (!pending.length) return;
    const next = [...events, ...pending];
    events = next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    pending = [];
    seq += 1;
    snapshot = { events, counters: { ...counters }, seq };
    for (const listener of listeners) listener();
  };

  return {
    /** Feed one raw output line. */
    push(line) {
      const entries = parseStreamLine(line);
      if (!entries.length) return;
      for (const entry of entries) {
        if (entry.kind === 'tool') counters.tools += 1;
        if (entry.stats?.turns) counters.turns = entry.stats.turns;
        if (typeof entry.stats?.costUsd === 'number') counters.costUsd = entry.stats.costUsd;
        pending.push({ ...entry, at: Date.now() });
      }
      if (!timer) timer = setTimeout(flush, FLUSH_MS);
    },
    /** Drop everything — called when a new run starts. */
    reset() {
      if (timer) clearTimeout(timer);
      timer = null;
      events = [];
      pending = [];
      counters = { tools: 0, turns: 0, costUsd: null };
      seq += 1;
      snapshot = { events, counters: { ...counters }, seq };
      for (const listener of listeners) listener();
    },
    /** Push any buffered entries immediately (used when a run ends). */
    flushNow() {
      if (timer) clearTimeout(timer);
      flush();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
  };
}
