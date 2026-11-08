// OSC 7501, the Program Status Protocol (herdr-core): a program says what it is
// doing with `ESC ] 7501 ; state=working:kind=permission:msg=<base64> ESC \`.
// Lets any CLI that speaks it drive a tab's agent state, no per-CLI hook needed.

// The answer to a program asking whether we speak the protocol (`ESC ] 7501 ; ?`).
// Claude Code asks at startup and only reports its state once answered.
export const PROGRAM_STATUS_REPLY = '\x1b]7501;?:states=idle,working,done,blocked,error\x1b\\';

const decode = (b64) => {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
};

// The OSC payload (after "7501;") as an agentHookState state: { state, ... },
// null to clear it, or undefined to ignore (malformed, or a sub-record with an id).
export function parseProgramStatus(data) {
  const fields = {};
  for (const part of String(data).split(':')) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  // Records with an id are the program's sub-tasks; the tab shows only the root.
  if (fields.id) return undefined;
  const message = (fields.msg && decode(fields.msg)) || undefined;
  switch (fields.state) {
    case 'working': return { state: 'working', message };
    case 'blocked': return { state: 'permission', message: message || fields.kind };
    case 'idle': return { state: 'waiting', message };
    case 'done': return { state: 'done', message };
    case 'error': return { state: 'done', error: true, message };
    case 'clear': return null;
    default: return undefined;
  }
}
