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

export function clearAgentHookState(sessionId) {
  states.delete(sessionId);
}
