import { listen } from '@tauri-apps/api/event';

// What each terminal's agent last said about itself through its hooks (see
// src-tauri/src/agent_hooks.rs). Plain module state like terminalActivity.js:
// events land here and the tabs summary pane reads it on its own tick.
//
// States:
//   working     — a prompt is being worked on (prompt submitted, tool running)
//   permission  — blocked on a permission prompt
//   waiting     — idle at its prompt (session started, or idle-prompt notice)
//   done        — finished its turn; your move

const states = new Map(); // sessionId -> { state, message, at }

// What each agent's tools pointed at this turn, so a tab can tell when another
// tab's agent is working in its repo. Targets are raw strings (a file path or
// a whole shell command); the tabs pane matches them against repo paths.
const touches = new Map(); // sessionId -> Map<target, { at, tool }>
const MAX_TOUCHES = 50;

const TARGET_KEYS = ['file_path', 'notebook_path', 'path', 'command'];

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
        : { state: 'waiting', message: payload.message };
    case 'Stop':
      return { state: 'done' };
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
    if (hookEvent === 'UserPromptSubmit' || hookEvent === 'SessionEnd') touches.delete(sessionId);
    else if (hookEvent === 'PreToolUse') recordTouches(sessionId, payload);
    const next = nextState(payload);
    if (next === undefined) return;
    if (next === null) states.delete(sessionId);
    else states.set(sessionId, { ...next, at: Date.now() });
  }).catch((e) => {
    started = false;
    console.debug('Agent hook listener unavailable:', e);
  });
}

export function getAgentHookState(sessionId) {
  return (sessionId && states.get(sessionId)) || null;
}

// [target, { at, tool }] pairs this session's agent touched this turn, oldest
// first.
export function getAgentTouches(sessionId) {
  return (sessionId && touches.get(sessionId)) || null;
}

export function clearAgentHookState(sessionId) {
  states.delete(sessionId);
  touches.delete(sessionId);
}
