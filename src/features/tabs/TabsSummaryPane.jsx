import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioWaveform,
  Bot,
  CircleCheck,
  GitBranch,
  Link2,
  MessageSquareMore,
  Moon,
  Paperclip,
  ShieldAlert,
  SquareTerminal,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { useBookmarks } from '../bookmarks';
import { useToast } from '../toast';
import { tabDisplayName, useTabManager } from './TabContext';
import { useTabsSummary } from './useTabsSummary';
import { getLastOutputAt, getTabSession } from './terminalActivity';
import { EDIT_TOOLS, getAgentHookState, getAgentTouches, getLastTurn } from './agentHookState';
import { useAttentionQueue } from './useAgentAttention';
import { getTabPrompt } from './tabPrompts';
import { linkRepo, setLinkedRepoRole, unlinkRepo, useLinkedRepos } from './useLinkedRepos';
import { REPO_ROLES as ROLES, repoRoleLabel as roleLabel } from './repoRoles';

// Output within this window counts as the terminal currently working.
const ACTIVE_MS = 2500;
// How long a tool call in another tab's repo keeps that tab marked, while the
// agent's turn is still going.
const REMOTE_MS = 2 * 60 * 1000;
// A tab's own activity that outranks another agent working in its repo.
const OWN_BUSY = new Set(['working', 'permission', 'running']);

function formatAgo(ms) {
  const secs = Math.max(0, Math.floor(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// What each activity looks like: an icon that names the state and its colour.
// `pulse` marks work in progress. How long it has held is in the row tooltip.
const ACTIVITY = {
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
function tabActivity(tabId, cliName, now) {
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
function remoteWork(tabs, cli, now) {
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
function remoteLabel(work, fromName) {
  const file = work.target.startsWith(`${work.root}/`) ? work.target.slice(work.root.length + 1) : null;
  let doing;
  if (EDIT_TOOLS.has(work.tool)) doing = file ? `editing ${file}` : 'editing';
  else if (work.tool === 'Bash') doing = 'running a command';
  else doing = file ? `reading ${file}` : 'reading';
  return `${work.cliName} from ${fromName} ${doing}`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// The newest turn of this tab's agent in a few words, or null when its tools
// haven't done anything worth listing.
function turnSummary(turn, now) {
  if (!turn) return null;
  const parts = [];
  if (turn.edited.size) parts.push(`edited ${turn.edited.size}`);
  if (turn.read.size) parts.push(`read ${turn.read.size}`);
  if (turn.commands) parts.push(`ran ${turn.commands}`);
  if (parts.length === 0) return null;
  parts.push(formatAgo((turn.endedAt ?? now) - turn.startedAt));
  return { text: parts.join(' · '), running: !turn.endedAt };
}

function relativeTo(path, root) {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

function ActivityIcon({ kind, label }) {
  const { icon: Icon, color, pulse } = ACTIVITY[kind];
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center', color, pulse && 'ins-pulse')}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
    </span>
  );
}

// Repo names share long prefixes (agentic-orchestration-…), so the end is what
// tells them apart: the ellipsis goes in the middle and the tail always shows.
const TAIL = 8;
function MiddleTruncate({ text, className }) {
  if (text.length <= TAIL * 2) {
    return <span className={cn('min-w-0 truncate', className)}>{text}</span>;
  }
  return (
    <span className={cn('flex min-w-0', className)}>
      <span className="truncate">{text.slice(0, -TAIL)}</span>
      <span className="shrink-0">{text.slice(-TAIL)}</span>
    </span>
  );
}

// Inline rename: Enter commits, Escape cancels, blur commits. An empty name
// (or the automatic one) goes back to automatic naming.
function RenameField({ initial, onCommit, onCancel }) {
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(ref.current?.value ?? '');
    else onCancel();
  };
  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Tab name"
      spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="ins-well h-5 min-w-0 flex-1 px-1 text-xs text-foreground outline-none"
    />
  );
}

export function TabsSummaryPane() {
  const { tabs, activeTabId, switchTab, requestCloseTab, reorderTab, renameTab, setTabRole } = useTabManager();
  const closable = tabs.length > 1;
  const { repo, cli, now } = useTabsSummary(tabs);
  const { bookmarks } = useBookmarks();
  const toast = useToast();
  const { linkedRepos } = useLinkedRepos(activeTabId);
  const tabName = (tab) => tabDisplayName(tab, bookmarks);
  const remote = remoteWork(tabs, cli, now);
  const queue = useAttentionQueue(tabs);
  const [openTrail, setOpenTrail] = useState(null); // tab id whose last turn is expanded
  const [renamingId, setRenamingId] = useState(null);
  // Drag-to-reorder: the row being dragged and where it would land.
  const [dragIndex, setDragIndex] = useState(null);
  const [dropAt, setDropAt] = useState(null); // { index, after }

  const commitRename = useCallback((tab, value) => {
    const name = value.trim();
    const automatic = tabDisplayName({ ...tab, customLabel: undefined }, bookmarks);
    renameTab(tab.id, name === automatic ? '' : name);
    setRenamingId(null);
  }, [bookmarks, renameTab]);
  const cancelRename = useCallback(() => setRenamingId(null), []);

  const onDragStart = useCallback((e, index) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  }, []);

  const onDragOver = useCallback((e, index) => {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDropAt((prev) => (prev?.index === index && prev.after === after ? prev : { index, after }));
  }, [dragIndex]);

  const endDrag = useCallback(() => {
    setDragIndex(null);
    setDropAt(null);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    if (dragIndex !== null && dropAt) {
      let to = dropAt.after ? dropAt.index + 1 : dropAt.index;
      if (dragIndex < to) to -= 1;
      reorderTab(dragIndex, to);
    }
    endDrag();
  }, [dragIndex, dropAt, reorderTab, endDrag]);

  const copyBranch = async (e, branch) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(branch);
      toast.success(`Copied ${branch}`);
    } catch {
      toast.error('Could not copy branch name');
    }
  };

  // Toggles another tab's repo in the active tab's prompt, so the agent knows
  // the feature spans more than one repo.
  const toggleLink = (e, tab, name, linked) => {
    e.stopPropagation();
    if (linked) {
      unlinkRepo(activeTabId, tab.projectPath);
      return;
    }
    linkRepo(activeTabId, { path: tab.projectPath, name, role: tab.role });
    getTabPrompt(activeTabId)?.open();
  };

  // Puts the files another (or this) tab's agent edited last turn into the
  // current prompt, e.g. to have a second agent review them.
  const attachEdits = (e, files) => {
    e.stopPropagation();
    const prompt = getTabPrompt(activeTabId);
    if (!prompt?.addFiles) return;
    prompt.addFiles(files);
    prompt.open();
    toast.success(`Attached ${plural(files.length, 'file')} to the prompt`);
  };

  const setRole = (tab, role) => {
    setTabRole(tab.id, role);
    setLinkedRepoRole(tab.projectPath, role || undefined);
  };

  const roleMenu = (tab, trigger) => (
    // Portalled menu clicks still bubble through React to the row.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-xs">
          <DropdownMenuRadioGroup value={tab.role ?? ''} onValueChange={(v) => setRole(tab, v)}>
            {ROLES.map((r) => (
              <DropdownMenuRadioItem key={r.value} value={r.value}>
                {r.label}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuRadioItem value="">None</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );

  return (
    <div className="flex flex-col">
      {tabs.map((tab, index) => {
        const info = repo[tab.id];
        const work = remote[tab.id];
        const workFrom = work && tabs.find((t) => t.id === work.fromTabId);
        const workLabel = workFrom && remoteLabel(work, tabName(workFrom));
        const own = tabActivity(tab.id, cli[tab.id], now);
        const activity = workLabel && !OWN_BUSY.has(own.kind) ? { kind: 'remote', label: workLabel } : own;
        const active = tab.id === activeTabId;
        const linked = !active && linkedRepos.some((r) => r.path === tab.projectPath);
        const name = tabName(tab);
        const queuePos = active ? -1 : queue.findIndex((q) => q.tabId === tab.id);
        const turn = cli[tab.id] ? getLastTurn(getTabSession(tab.id)) : null;
        const summary = turnSummary(turn, now);
        const trailOpen = summary && openTrail === tab.id;
        const root = tab.projectPath.replace(/\/+$/, '');
        const linkLabel = linked ? `Unlink ${name} from the current prompt` : `Link ${name} into the current prompt`;
        const renaming = renamingId === tab.id;
        // The slot the drop would fill; the two slots beside the dragged row are no-ops.
        const dropSlot = dropAt?.index === index ? (dropAt.after ? index + 1 : index) : null;
        const dropLine = dragIndex !== null && dropSlot !== null && dropSlot !== dragIndex && dropSlot !== dragIndex + 1;
        return (
          // A div, not a <button>: it holds the rename input and other controls.
          <div
            key={tab.id}
            role="button"
            tabIndex={0}
            draggable={closable && !renaming}
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={onDrop}
            onDragEnd={endDrag}
            onClick={() => switchTab(tab.id)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                switchTab(tab.id);
              } else if (e.key === 'F2') {
                e.preventDefault();
                setRenamingId(tab.id);
              }
            }}
            onMouseDown={(e) => {
              if (e.button === 1 && closable) {
                e.preventDefault();
                requestCloseTab(tab.id);
              }
            }}
            title={`${tab.projectPath}\n${activity.label}${activity.since ? ` · ${activity.since}` : ''}${
              workLabel && activity.kind !== 'remote' ? `\n${workLabel}` : ''
            }\nDouble-click or F2 to rename${closable ? ' · drag to reorder' : ''}`}
            aria-current={active ? 'page' : undefined}
            data-marker="top"
            className={cn(
              'group relative flex flex-col gap-1 py-2.5 pl-3 pr-2.5 text-left text-[11px] cursor-pointer edge-b-engraved outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]',
              active ? 'ins-row-selected before:!top-3' : 'hover:bg-foreground/5',
              dragIndex === index && 'opacity-50',
            )}
          >
            {/* Where the dragged tab will land: a lamp-lit hairline on the edge. */}
            {dropLine && (
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute inset-x-0 z-10 h-px bg-[var(--ins-lamp)]',
                  dropAt.after ? 'bottom-0' : 'top-0',
                )}
              />
            )}
            {/* Tier 1: what it is and what it is doing. */}
            <div className="flex h-5 min-w-0 items-center gap-2">
              <ActivityIcon kind={activity.kind} label={activity.label} />
              {queuePos >= 0 && (
                <span
                  title={`Waiting on you · ${queuePos === 0 ? 'next' : `#${queuePos + 1}`} for Alt+A`}
                  className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--ins-warn)]"
                >
                  {queuePos + 1}
                </span>
              )}
              {renaming ? (
                <RenameField
                  initial={name}
                  onCommit={(value) => commitRename(tab, value)}
                  onCancel={cancelRename}
                />
              ) : (
                <span
                  className="flex min-w-0"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(tab.id);
                  }}
                >
                  <MiddleTruncate
                    text={name}
                    className={cn('text-xs', active ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}
                  />
                </span>
              )}
              {tab.role &&
                roleMenu(
                  tab,
                  <span
                    role="button"
                    title="Change repo role"
                    className="shrink-0 px-1 text-[10px] font-mono text-muted-foreground edge-engraved hover:text-[var(--ins-lamp)]"
                  >
                    {roleLabel(tab.role)}
                  </span>,
                )}
              {linked && (
                <span
                  role="button"
                  aria-pressed="true"
                  aria-label={linkLabel}
                  title="Linked to the current prompt — click to unlink"
                  onClick={(e) => toggleLink(e, tab, name, linked)}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ins-lamp)] hover:text-[var(--ins-fault)]"
                >
                  <Link2 className="h-3 w-3" />
                </span>
              )}

              {info?.branch && (
                <span className="ml-auto shrink-0 whitespace-nowrap font-mono tabular-nums text-muted-foreground group-hover:hidden group-has-[[data-state=open]]:hidden">
                  {info.files === 0 ? (
                    'clean'
                  ) : (
                    <span title={`${info.files} file${info.files === 1 ? '' : 's'} changed`}>
                      <span className="text-git-added">+{info.added}</span>{' '}
                      <span className="text-git-deleted">−{info.deleted}</span>
                    </span>
                  )}
                </span>
              )}
              <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex group-has-[[data-state=open]]:flex">
                {!tab.role &&
                  roleMenu(
                    tab,
                    <span
                      role="button"
                      title="Tag repo role"
                      className="px-1 text-[10px] font-mono text-muted-foreground edge-engraved hover:text-[var(--ins-lamp)]"
                    >
                      tag
                    </span>,
                  )}
                {!active && !linked && (
                  <span
                    role="button"
                    aria-pressed="false"
                    aria-label={linkLabel}
                    title="Link this repo into the current prompt"
                    onClick={(e) => toggleLink(e, tab, name, linked)}
                    className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-[var(--ins-lamp)]"
                  >
                    <Link2 className="h-3 w-3" />
                  </span>
                )}
                {closable && (
                  <span
                    role="button"
                    aria-label={`Close ${name}`}
                    title="Close tab"
                    onClick={(e) => {
                      e.stopPropagation();
                      requestCloseTab(tab.id);
                    }}
                    className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-[var(--ins-fault)]"
                  >
                    ×
                  </span>
                )}
              </span>
            </div>

            {/* Tier 2: the branch, in full; long names wrap rather than clip. */}
            <div
              className={cn(
                'flex min-w-0 pl-6 text-[11px]',
                active ? 'text-muted-foreground' : 'text-muted-foreground/75',
              )}
            >
              {info?.branch ? (
                <span
                  role="button"
                  onClick={(e) => copyBranch(e, info.branch)}
                  title="Copy branch name"
                  className="flex min-w-0 items-start gap-1 font-mono hover:text-[var(--ins-lamp)]"
                >
                  <GitBranch className="mt-[2px] h-3 w-3 shrink-0" />
                  <span className="min-w-0 break-all">{info.branch}</span>
                </span>
              ) : (
                <span>no repo</span>
              )}
            </div>

            {/* Tier 3: what its agent did in the latest turn; click for the files. */}
            {summary && (
              <div className="flex min-w-0 flex-col pl-6 text-[11px] text-muted-foreground">
                <span
                  role="button"
                  aria-expanded={!!trailOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenTrail(trailOpen ? null : tab.id);
                  }}
                  title={trailOpen ? 'Hide files' : 'Show the files it edited'}
                  className="min-w-0 truncate font-mono tabular-nums hover:text-[var(--ins-lamp)]"
                >
                  {summary.running ? 'this turn' : 'last turn'}: {summary.text}
                </span>
                {trailOpen && (
                  <div className="flex min-w-0 flex-col gap-0.5 pt-1">
                    {[...turn.edited].map((f) => (
                      <span key={f} title={f} className="min-w-0 truncate font-mono text-foreground/80">
                        {relativeTo(f, root)}
                      </span>
                    ))}
                    {turn.edited.size > 0 ? (
                      <span
                        role="button"
                        onClick={(e) => attachEdits(e, [...turn.edited])}
                        title="Add these files to the current tab's prompt"
                        className="flex items-center gap-1 self-start pt-0.5 hover:text-[var(--ins-lamp)]"
                      >
                        <Paperclip className="h-3 w-3" />
                        attach {plural(turn.edited.size, 'file')} to prompt
                      </span>
                    ) : (
                      <span>no files edited</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tier 4: another tab's agent working in this repo. */}
            {workLabel && (
              <div className="flex min-w-0 items-center gap-1 pl-6 text-[11px] text-[var(--ins-lamp)]">
                <Bot className="h-3 w-3 shrink-0" />
                <span className="min-w-0 truncate">{workLabel}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
