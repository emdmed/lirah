import { listen } from '@tauri-apps/api/event';
import { createEmitter } from '../../lib/createStore';
import { bashFileTargets } from './bashFileTargets';

// What each terminal's agent last said about itself through its hooks (see
// src-tauri/src/agent_hooks.rs). Plain module state like terminalActivity.js:
// events land here and the tabs summary pane reads it on its own tick.
// Subscribers (useAgentAttention, the attention queue) hear every change.
//
// States:
//   working     — a prompt is being worked on (prompt submitted, tool running)
//   permission  — blocked on a permission prompt
//   waiting     — idle at its prompt (session started, or idle-prompt notice)
//   done        — finished its turn; your move

const states = new Map(); // sessionId -> { state, message, notice, error, source, at, seq }

// Each Claude session's transcript (JSONL), from its hook payloads, so plan
// auto-pilot can read what the agent last said.
const transcripts = new Map(); // sessionId -> path

// What each agent's tools pointed at this turn, so a tab can tell when another
// tab's agent is working in its repo. Targets are raw strings (a file path or
// a whole shell command); the tabs pane matches them against repo paths.
const touches = new Map(); // sessionId -> Map<target, { at, tool }>
const MAX_TOUCHES = 50;

const TARGET_KEYS = ['file_path', 'notebook_path', 'path', 'command'];

export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'NotebookRead']);

// Files each agent read or edited this turn, by absolute path, for the file
// tree's marks. `live` while the tool is running. Cleared on the next prompt.
const fileActivity = new Map(); // sessionId -> Map<path, { kind: 'edit'|'read', live }>
const files = createEmitter();
let filesVersion = 0;

function emitFiles() {
  filesVersion += 1;
  files.emit();
}

// The files one tool call touched: its file argument, or for Bash, the files
// named in the command (agents often read with cat/sed instead of Read).
function toolFiles(payload) {
  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  if (tool === 'Bash') return bashFileTargets(input.command, payload.cwd);
  const kind = EDIT_TOOLS.has(tool) ? 'edit' : READ_TOOLS.has(tool) ? 'read' : null;
  const path = input.file_path || input.notebook_path;
  if (!kind || typeof path !== 'string' || !path.startsWith('/')) return [];
  return [{ path, kind }];
}

function recordFile(sessionId, payload, live) {
  const found = toolFiles(payload);
  if (found.length === 0) return;
  let paths = fileActivity.get(sessionId);
  if (!paths) fileActivity.set(sessionId, (paths = new Map()));
  for (const { path, kind } of found) {
    const prev = paths.get(path);
    paths.set(path, { kind: prev?.kind === 'edit' ? 'edit' : kind, live });
  }
  emitFiles();
}

// A tool denied at the prompt never sends PostToolUse; the turn's end settles it.
function settleFiles(sessionId) {
  const paths = fileActivity.get(sessionId);
  if (!paths) return;
  let changed = false;
  for (const [path, entry] of paths) {
    if (entry.live) {
      paths.set(path, { ...entry, live: false });
      changed = true;
    }
  }
  if (changed) emitFiles();
}

function forgetFiles(sessionId) {
  if (fileActivity.delete(sessionId)) emitFiles();
}

// The last few turns per session, from prompt to Stop: what the tools actually
// did (PostToolUse, so an edit denied at the permission prompt isn't counted).
const turns = new Map(); // sessionId -> [{ startedAt, endedAt, edited, read, commands }]
const MAX_TURNS = 5;

// The last state each session had when you looked at it, so the queue only
// holds what changed while you were looking elsewhere. By sequence number, not
// time: an event can land in the same millisecond as the look.
const acked = new Map(); // sessionId -> state seq
let seq = 0;
// States that mean "your move". `waiting` only counts when the agent said so
// (an idle-prompt notice), not when a session merely started.
const ATTENTION = new Set(['permission', 'done', 'waiting']);

const hooks = createEmitter();
let version = 0;
// Whether the user is looking at this session right now. Set by
// useAgentAttention, which knows the active tab and window focus.
let isFocused = () => false;

function emit(change) {
  version += 1;
  hooks.emit(change);
}

function recordTouches(sessionId, payload) {
  const input = payload.tool_input;
  if (!input || typeof input !== 'object') return;
  let targets = touches.get(sessionId);
  for (const key of TARGET_KEYS) {
    const target = input[key];
    if (typeof target !== 'string' || !target.includes('/')) continue;
    if (!targets) touches.set(sessionId, (targets = new Map()));
    targets.delete(target); // Re-insert so the newest is last.
    targets.set(target, { at: Date.now(), tool: payload.tool_name });
  }
  while (targets?.size > MAX_TOUCHES) targets.delete(targets.keys().next().value);
}

function startTurn(sessionId, at) {
  const list = turns.get(sessionId) || [];
  const turn = { startedAt: at, endedAt: null, edited: new Set(), read: new Set(), commands: 0 };
  list.push(turn);
  while (list.length > MAX_TURNS) list.shift();
  turns.set(sessionId, list);
  return turn;
}

// The turn in progress; tools seen without a prompt (hooks installed
// mid-session) open one.
function openTurn(sessionId, at) {
  const last = turns.get(sessionId)?.at(-1);
  return last && !last.endedAt ? last : startTurn(sessionId, at);
}

function recordTool(sessionId, payload, at) {
  const turn = openTurn(sessionId, at);
  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  const file = input.file_path || input.notebook_path;
  if (tool === 'Bash') turn.commands += 1;
  else if (typeof file === 'string' && EDIT_TOOLS.has(tool)) {
    turn.edited.add(file);
    turn.read.delete(file);
  } else if (typeof file === 'string' && READ_TOOLS.has(tool) && !turn.edited.has(file)) {
    turn.read.add(file);
  }
}

function nextState(payload) {
  switch (payload?.hook_event_name) {
    case 'UserPromptSubmit':
    case 'PreToolUse':
    case 'PostToolUse':
      return { state: 'working' };
    case 'PermissionRequest':
      return { state: 'permission', message: payload.tool_name };
    case 'Notification':
      return payload.notification_type === 'permission_prompt' ||
        /permission/i.test(payload.message || '')
        ? { state: 'permission', message: payload.message }
        : { state: 'waiting', message: payload.message, notice: true };
    case 'Stop':
      return payload.error ? { state: 'done', error: true } : { state: 'done' };
    case 'SessionStart':
      return { state: 'waiting' };
    case 'SessionEnd':
      return null;
    default:
      return undefined; // Not a state change.
  }
}

let started = false;
export function startAgentHookListener() {
  if (started) return;
  started = true;
  listen('agent-hook', (event) => {
    const { sessionId, payload } = event.payload;
    const hookEvent = payload?.hook_event_name;
    const now = Date.now();
    if (typeof payload?.transcript_path === 'string') transcripts.set(sessionId, payload.transcript_path);
    if (hookEvent === 'UserPromptSubmit' || hookEvent === 'SessionEnd') {
      touches.delete(sessionId);
      forgetFiles(sessionId);
    } else if (hookEvent === 'PreToolUse') {
      recordTouches(sessionId, payload);
      recordFile(sessionId, payload, true);
    } else if (hookEvent === 'PostToolUse') {
      recordFile(sessionId, payload, false);
    } else if (hookEvent === 'Stop') {
      settleFiles(sessionId);
    }
    if (hookEvent === 'UserPromptSubmit') startTurn(sessionId, now);
    else if (hookEvent === 'PostToolUse') recordTool(sessionId, payload, now);

    let turnMs = null;
    if (hookEvent === 'Stop') {
      const turn = turns.get(sessionId)?.at(-1);
      if (turn && !turn.endedAt) {
        turn.endedAt = now;
        turnMs = now - turn.startedAt;
      }
    }

    const next = nextState(payload);
    if (next === undefined) {
      if (hookEvent === 'PostToolUse') emit({ sessionId });
      return;
    }
    const prev = states.get(sessionId) || null;
    if (next === null) states.delete(sessionId);
    else states.set(sessionId, { ...next, source: payload.source || 'claude', at: now, seq: ++seq });
    if (next && isFocused(sessionId)) acked.set(sessionId, seq);
    emit({ sessionId, prev, next: states.get(sessionId) || null, turnMs });
  }).catch((e) => {
    started = false;
    console.debug('Agent hook listener unavailable:', e);
  });
}

export function subscribeAgentHooks(fn) {
  return hooks.subscribe(fn);
}

// Changes on every event, for useSyncExternalStore.
export function getAgentHookVersion() {
  return version;
}

export function setAgentFocusResolver(fn) {
  isFocused = fn || (() => false);
}

export function getAgentHookState(sessionId) {
  return (sessionId && states.get(sessionId)) || null;
}

// [target, { at, tool }] pairs this session's agent touched this turn, oldest
// first.
export function getAgentTouches(sessionId) {
  return (sessionId && touches.get(sessionId)) || null;
}

export function getAgentTranscript(sessionId) {
  return (sessionId && transcripts.get(sessionId)) || null;
}

// The newest turn, finished or still running.
export function getLastTurn(sessionId) {
  return (sessionId && turns.get(sessionId)?.at(-1)) || null;
}

// Whether this session's agent is waiting on you and you haven't looked yet.
export function needsAttention(sessionId) {
  const s = getAgentHookState(sessionId);
  if (!s || !ATTENTION.has(s.state)) return false;
  if (s.state === 'waiting' && !s.notice) return false;
  return s.seq > (acked.get(sessionId) || 0);
}

export function acknowledgeAgent(sessionId) {
  if (!sessionId || !needsAttention(sessionId)) return;
  acked.set(sessionId, states.get(sessionId).seq);
  emit({ sessionId });
}

export function clearAgentHookState(sessionId) {
  states.delete(sessionId);
  touches.delete(sessionId);
  turns.delete(sessionId);
  transcripts.delete(sessionId);
  acked.delete(sessionId);
  forgetFiles(sessionId);
  emit({ sessionId });
}

export function subscribeFileActivity(fn) {
  return files.subscribe(fn);
}

export function getFileActivityVersion() {
  return filesVersion;
}

// Every agent's files merged, path -> { kind, live }: edit beats read, live
// beats settled.
export function getFileActivity() {
  const merged = new Map();
  for (const paths of fileActivity.values()) {
    for (const [path, entry] of paths) merged.set(path, strongerMark(merged.get(path), entry));
  }
  return merged;
}

const MARK_RANK = { read: 1, edit: 2 };
export function strongerMark(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    kind: MARK_RANK[b.kind] > MARK_RANK[a.kind] ? b.kind : a.kind,
    live: a.live || b.live,
  };
}
