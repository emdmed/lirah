import { AudioWaveform, Bot, CircleCheck, MessageSquareMore, Moon, ShieldAlert, SquareTerminal } from 'lucide-react';
import { formatAgo } from '../../lib/formatDuration';
import { getLastOutputAt, getTabSession } from './terminalActivity';
import { EDIT_TOOLS, getAgentHookState, getAgentTouches } from './agentHookState';

// What each tab is doing, for the tabs summary pane: from its agent's hooks
// when it has them, else guessed from terminal output; and which tabs' repos
// another tab's agent is working in. Plain functions over module state.

// Output within this window counts as the terminal currently working.
const ACTIVE_MS = 2500;
// How long a tool call in another tab's repo keeps that tab marked, while the
// agent's turn is still going.
const REMOTE_MS = 2 * 60 * 1000;
// A tab's own activity that outranks another agent working in its repo.
export const OWN_BUSY = new Set(['working', 'permission', 'running']);

// What each activity looks like: an icon that names the state and its colour.
// `pulse` marks work in progress. How long it has held is in the row tooltip.
export const ACTIVITY = {
  working: { icon: AudioWaveform, color: 'text-[var(--ins-lamp)]', pulse: true },
  permission: { icon: ShieldAlert, color: 'text-[var(--ins-fault)]', pulse: true },
  done: { icon: CircleCheck, color: 'text-[var(--ins-ok)]' },
  waiting: { icon: MessageSquareMore, color: 'text-[var(--ins-warn)]' },
  running: { icon: SquareTerminal, color: 'text-[var(--ins-lamp)]', pulse: true },
  remote: { icon: Bot, color: 'text-[var(--ins-lamp)]', pulse: true },
  idle: { icon: Moon, color: 'text-muted-foreground' },
};

// What the agent's own hooks said, when it has them (see agentHookState.js).
function hookActivity(cliName, hook, now) {
  const since = formatAgo(now - hook.at);
  switch (hook.state) {
    case 'working':
      return { kind: 'working', label: `${cliName} working`, since };
    case 'permission':
      return {
        kind: 'permission',
        label: hook.message ? `${cliName} needs permission: ${hook.message}` : `${cliName} needs permission`,
        since,
      };
    case 'done':
      return { kind: 'done', label: `${cliName} done, your turn`, since };
    default:
      return { kind: 'waiting', label: `${cliName} waiting`, since };
  }
}

// Agents with hooks report their state; otherwise guess from output: a running
// CLI that has gone quiet is waiting on you, a plain shell that has gone quiet
// is idle.
export function tabActivity(tabId, cliName, now) {
  const sessionId = getTabSession(tabId);
  const hook = getAgentHookState(sessionId);
  if (hook && cliName) return hookActivity(cliName, hook, now);
  const out = getLastOutputAt(sessionId);
  const quiet = out ? now - out : Infinity;
  const since = out ? formatAgo(quiet) : null;
  if (cliName) {
    return quiet < ACTIVE_MS
      ? { kind: 'working', label: `${cliName} working` }
      : { kind: 'waiting', label: `${cliName} waiting`, since };
  }
  return quiet < ACTIVE_MS
    ? { kind: 'running', label: 'running' }
    : { kind: 'idle', label: 'idle', since };
}

// Whether `target` (a path or a whole shell command) names `root` or something
// inside it, and not a sibling that only shares the prefix (repo vs repo-web).
function mentions(target, root) {
  for (let i = target.indexOf(root); i !== -1; i = target.indexOf(root, i + 1)) {
    const next = target[i + root.length];
    if (next === undefined || !/[\w.-]/.test(next)) return true;
  }
  return false;
}

// Tabs whose repo another tab's agent is working in right now, keyed by tab
// id: the agent reaches over (a feature spanning repos) and the other tab shows
// it. Built from the paths and commands its tools were called with this turn.
export function remoteWork(tabs, cli, now) {
  const roots = tabs.map((t) => ({ id: t.id, root: t.projectPath.replace(/\/+$/, '') }));
  const found = {};
  for (const from of tabs) {
    const cliName = cli[from.id];
    const sessionId = getTabSession(from.id);
    const hook = getAgentHookState(sessionId);
    if (!cliName || (hook?.state !== 'working' && hook?.state !== 'permission')) continue;
    const fromRoot = roots.find((r) => r.id === from.id).root;
    for (const [target, touch] of getAgentTouches(sessionId) || []) {
      if (now - touch.at > REMOTE_MS) continue;
      // The most specific repo wins, so a nested repo is told from its parent.
      const hits = roots.filter((r) => mentions(target, r.root));
      for (const owner of hits) {
        if (owner.root === fromRoot) continue;
        if (hits.some((o) => o.root.startsWith(`${owner.root}/`))) continue;
        const prev = found[owner.id];
        if (prev && prev.at > touch.at) continue;
        found[owner.id] = { fromTabId: from.id, cliName, target, root: owner.root, ...touch };
      }
    }
  }
  return found;
}

// What another tab's agent is doing here, in a few words.
export function remoteLabel(work, fromName) {
  const file = work.target.startsWith(`${work.root}/`) ? work.target.slice(work.root.length + 1) : null;
  let doing;
  if (EDIT_TOOLS.has(work.tool)) doing = file ? `editing ${file}` : 'editing';
  else if (work.tool === 'Bash') doing = 'running a command';
  else doing = file ? `reading ${file}` : 'reading';
  return `${work.cliName} from ${fromName} ${doing}`;
}

// The newest turn of this tab's agent in a few words, or null when its tools
// haven't done anything worth listing.
export function turnSummary(turn, now) {
  if (!turn) return null;
  const parts = [];
  if (turn.edited.size) parts.push(`edited ${turn.edited.size}`);
  if (turn.read.size) parts.push(`read ${turn.read.size}`);
  if (turn.commands) parts.push(`ran ${turn.commands}`);
  if (parts.length === 0) return null;
  parts.push(formatAgo((turn.endedAt ?? now) - turn.startedAt));
  return { text: parts.join(' · '), running: !turn.endedAt };
}

export function relativeTo(path, root) {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}
