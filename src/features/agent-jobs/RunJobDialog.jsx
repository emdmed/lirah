import { useState, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bot, ChevronDown, Check, GitBranch, FolderGit2, Pin, ListTree, FolderInput, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { cn } from '../../lib/utils';
import { getRelativePath } from '../../utils/pathUtils';
import { useFileGroups } from '../file-groups';
import { usePromptTemplates } from '../templates';
import { usePinnedFiles } from '../pinned-files';
import { useAgentJobs } from './AgentJobsContext';

// Agents the job runner knows how to drive headlessly. `bin` is what gets probed
// on PATH; `value` is the id the Rust registry matches on.
const CLI_OPTIONS = [
  { value: 'claude', label: 'Claude Code', bin: 'claude' },
  { value: 'opencode', label: 'opencode', bin: 'opencode' },
  { value: 'codex', label: 'Codex', bin: 'codex' },
  { value: 'gemini', label: 'Gemini', bin: 'gemini' },
  { value: 'cursor-agent', label: 'Cursor', bin: 'cursor-agent' },
  { value: 'amp', label: 'Amp', bin: 'amp' },
];

const MAX_COPIES = 3;

const SOURCE_META = {
  selected: { label: 'tree', icon: ListTree },
  pinned: { label: 'pinned', icon: Pin },
  group: { label: 'group', icon: FolderInput },
};

// Turn a template + chosen files + free-text into a single headless prompt.
function assemblePrompt({ template, files, instructions }) {
  const parts = [];
  if (template?.content) parts.push(template.content.trim());
  if (instructions?.trim()) parts.push(instructions.trim());
  if (files.length) {
    const lines = files.map((f) => {
      const note =
        f.state === 'do-not-modify'
          ? ' (reference only — do not modify)'
          : f.state === 'use-as-example'
          ? ' (use as an example)'
          : '';
      return `@${f.relativePath}${note}`;
    });
    parts.push(`Relevant files:\n${lines.join('\n')}`);
  }
  return parts.join('\n\n');
}

export function RunJobDialog({ open, onOpenChange, projectPath }) {
  const { getGroupsForProject } = useFileGroups();
  const { templates } = usePromptTemplates();
  const { getPinnedPaths } = usePinnedFiles();
  const { launchRace, selectedContextFiles, findOverlappingJobs } = useAgentJobs();

  const groups = useMemo(
    () => (projectPath ? getGroupsForProject(projectPath) : []),
    [projectPath, getGroupsForProject]
  );

  const pinnedFiles = useMemo(() => {
    if (!projectPath) return [];
    return getPinnedPaths().map((abs) => ({
      relativePath: getRelativePath(abs, projectPath),
      state: 'modify',
      source: 'pinned',
    }));
  }, [projectPath, getPinnedPaths]);

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState(null);
  // Agents to run this prompt through. More than one candidate makes it a race:
  // each gets its own worktree and you keep exactly one result.
  const [clis, setClis] = useState(() => new Set(['claude']));
  const [copies, setCopies] = useState(1);
  const [availableClis, setAvailableClis] = useState(null); // null = not probed yet
  const [useWorktree, setUseWorktree] = useState(true);
  const [isGitRepo, setIsGitRepo] = useState(true);
  const [instructions, setInstructions] = useState('');

  // Detect whether the project is inside a git repo — worktree isolation and
  // diff review only work when it is.
  useEffect(() => {
    if (!open || !projectPath) return;
    let cancelled = false;
    invoke('run_git_command', { repoPath: projectPath, args: ['rev-parse', '--is-inside-work-tree'] })
      .then(() => {
        if (!cancelled) setIsGitRepo(true);
      })
      .catch(() => {
        if (!cancelled) {
          setIsGitRepo(false);
          setUseWorktree(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectPath]);
  // Probe which agent CLIs are actually installed, so a race can't be aimed at a
  // binary that isn't there. A failed probe leaves the option enabled rather
  // than hiding a working agent.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const found = await Promise.all(
        CLI_OPTIONS.map(async (o) => {
          try {
            return (await invoke('check_command_exists', { command: o.bin })) ? o.value : null;
          } catch {
            return o.value;
          }
        })
      );
      if (!cancelled) setAvailableClis(new Set(found.filter(Boolean)));
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const [groupFiles, setGroupFiles] = useState([]); // files pulled in from a group
  const [checked, setChecked] = useState(() => new Set());

  // Merge the three sources, de-duplicated by relativePath (tree > group > pinned).
  const candidates = useMemo(() => {
    const byPath = new Map();
    const add = (list, source) => {
      for (const f of list) {
        if (!f.relativePath) continue;
        if (!byPath.has(f.relativePath)) {
          byPath.set(f.relativePath, { ...f, source });
        }
      }
    };
    add(selectedContextFiles, 'selected');
    add(groupFiles, 'group');
    add(pinnedFiles, 'pinned');
    return Array.from(byPath.values());
  }, [selectedContextFiles, groupFiles, pinnedFiles]);

  // On open: pre-check the tree selection, reset transient state.
  useEffect(() => {
    if (open) {
      setName('');
      setInstructions('');
      setGroupFiles([]);
      setChecked(new Set(selectedContextFiles.map((f) => f.relativePath)));
    }
  }, [open, selectedContextFiles]);

  const template = templates.find((t) => t.id === templateId) || null;
  const checkedFiles = candidates.filter((c) => checked.has(c.relativePath));
  const canRun =
    !!projectPath && (!!template || checkedFiles.length > 0 || instructions.trim().length > 0);

  // Files this job is allowed to change (reference/example files excluded).
  const modifiablePaths = useMemo(
    () =>
      checkedFiles
        .filter((f) => f.state !== 'do-not-modify' && f.state !== 'use-as-example')
        .map((f) => f.relativePath),
    [checkedFiles]
  );

  // Warn when another pending/running job in this repo already owns some of the
  // same files — the collision the reconciler would otherwise have to untangle.
  const overlaps = useMemo(
    () => (open ? findOverlappingJobs(projectPath, modifiablePaths) : []),
    [open, findOverlappingJobs, projectPath, modifiablePaths]
  );

  const toggleFile = (relativePath) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  };

  const addGroup = (group) => {
    setGroupFiles((prev) => {
      const existing = new Set(prev.map((f) => f.relativePath));
      const merged = [...prev];
      for (const f of group.files) {
        if (!existing.has(f.relativePath)) merged.push({ ...f, source: 'group' });
      }
      return merged;
    });
    setChecked((prev) => new Set([...prev, ...group.files.map((f) => f.relativePath)]));
  };

  // Racing only makes sense when every candidate gets its own worktree —
  // in-place runs would all edit the same files at once.
  const canRace = isGitRepo && useWorktree;
  const candidateCount = canRace ? clis.size * copies : 1;

  const toggleCli = (value) => {
    if (!canRace) {
      setClis(new Set([value])); // no isolation: picking swaps the single agent
      return;
    }
    setClis((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        if (next.size === 1) return prev; // always leave one agent selected
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  // Dropping isolation collapses a pending race back to a single candidate.
  useEffect(() => {
    if (canRace) return;
    setCopies(1);
    setClis((prev) => (prev.size > 1 ? new Set([[...prev][0]]) : prev));
  }, [canRace]);

  const handleRun = async () => {
    const prompt = assemblePrompt({ template, files: checkedFiles, instructions });
    if (!prompt.trim()) return;
    const label =
      name.trim() ||
      template?.title ||
      `Agent job (${checkedFiles.length} file${checkedFiles.length === 1 ? '' : 's'})`;
    await launchRace({
      clis: [...clis],
      copies: canRace ? copies : 1,
      prompt,
      label,
      repoPath: projectPath,
      useWorktree,
      intendedFiles: modifiablePaths,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Bot className="h-4 w-4" />
            Run background agent
          </DialogTitle>
          <DialogDescription className="text-xs">
            Dispatch a headless CLI-agent run. Output streams to the Jobs panel; changes are
            reviewed before they touch your working tree.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1 flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional — defaults to template / file count"
              className="h-7 min-w-[150px] flex-1 rounded border edge-engraved bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <Picker
            label="Template"
            value={template?.title || 'None'}
            items={[{ id: null, name: 'None' }, ...templates.map((t) => ({ id: t.id, name: t.title }))]}
            selectedId={templateId}
            onSelect={setTemplateId}
          />

          {/* Context files: tree selection + pinned, with groups as an add-in */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Context files ({checkedFiles.length})
              </span>
              {groups.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <FolderInput className="h-3 w-3" />
                      Add file group
                      <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-64 overflow-auto text-xs">
                    {groups.map((g) => (
                      <DropdownMenuItem
                        key={g.id}
                        onClick={() => addGroup(g)}
                        className="text-[11px] py-1.5"
                      >
                        {g.name} ({g.files.length})
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="max-h-40 overflow-auto rounded border edge-engraved">
              {candidates.length === 0 ? (
                <div className="px-2 py-3 text-center text-[10px] text-muted-foreground">
                  No files selected. Pick files in the tree, pin files, or add a group.
                </div>
              ) : (
                candidates.map((f) => {
                  const meta = SOURCE_META[f.source] || SOURCE_META.selected;
                  const Icon = meta.icon;
                  return (
                    <label
                      key={f.relativePath}
                      className="flex cursor-pointer items-center gap-2 px-2 py-1 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked.has(f.relativePath)}
                        onCheckedChange={() => toggleFile(f.relativePath)}
                      />
                      <span className="flex-1 truncate font-mono text-[11px]">{f.relativePath}</span>
                      <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                        <Icon className="h-2.5 w-2.5" />
                        {meta.label}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Instructions {template ? '(optional)' : ''}
            </span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="e.g. Write unit tests for these files following existing conventions."
              className="w-full resize-none rounded border edge-engraved bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Agents: pick one, or several to race them against each other. */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Agents ({clis.size})
              </span>
              {canRace && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span>runs each</span>
                  {Array.from({ length: MAX_COPIES }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCopies(n)}
                      className={cn(
                        'h-4 w-4 rounded-sm border text-[10px] leading-none tabular-nums',
                        copies === n
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'edge-engraved hover:bg-muted/50'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                  <span>×</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {CLI_OPTIONS.map((o) => {
                const missing = availableClis && !availableClis.has(o.value);
                const on = clis.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={missing && !on}
                    onClick={() => toggleCli(o.value)}
                    title={
                      missing
                        ? `${o.bin} not found on PATH`
                        : canRace
                        ? 'Toggle — two or more agents race in separate worktrees'
                        : 'Racing needs isolated worktrees; picking swaps the agent'
                    }
                    className={cn(
                      'rounded-sm border px-1.5 py-0.5 text-[11px] transition-colors',
                      on
                        ? 'border-primary/70 bg-primary/10 text-foreground'
                        : 'edge-engraved text-muted-foreground hover:bg-muted/50',
                      missing && !on && 'opacity-40 cursor-not-allowed line-through'
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            {candidateCount > 1 && (
              <span className="text-[10px] leading-snug text-muted-foreground/70">
                Races {candidateCount} candidates on the same prompt, one worktree each. Compare the
                diffs, keep one — the rest are discarded.
              </span>
            )}
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => isGitRepo && setUseWorktree((v) => !v)}
              disabled={!isGitRepo}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
              title={
                !isGitRepo
                  ? 'Not a git repository — jobs run in-place with no diff review'
                  : useWorktree
                  ? 'Runs in an isolated git worktree — changes quarantined until you apply them to your working tree'
                  : 'Runs in-place — edits your working tree directly'
              }
            >
              {useWorktree ? <GitBranch className="h-3 w-3 text-primary" /> : <FolderGit2 className="h-3 w-3" />}
              {!isGitRepo ? 'In-place (no git repo)' : useWorktree ? 'Isolated worktree' : 'In-place'}
            </button>
          </div>
        </div>

        {overlaps.length > 0 && (
          <div className="shrink-0 rounded border border-[var(--color-status-warning)]/40 bg-[var(--color-status-warning)]/10 px-2.5 py-2 text-[10px] leading-snug">
            <div className="flex items-center gap-1.5 font-medium text-[var(--color-status-warning)]">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Overlaps {overlaps.length} pending job{overlaps.length === 1 ? '' : 's'}
            </div>
            <div className="mt-1 flex flex-col gap-1 text-muted-foreground">
              {overlaps.map((o) => (
                <div key={o.id} className="truncate">
                  <span className="text-foreground/80">{o.label}</span>{' '}
                  <span className="opacity-70">({o.status})</span> — {o.files.join(', ')}
                </div>
              ))}
            </div>
            <div className="mt-1 text-muted-foreground/70">
              Both jobs will edit these files; you'll have to reconcile them. Consider splitting the work by file instead.
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleRun} disabled={!canRun}>
            <Bot className="h-3 w-3 mr-1" />
            {candidateCount > 1 ? `Race ${candidateCount}` : 'Run'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Picker({ label, value, items, selectedId, onSelect, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button variant="outline" size="sm" className="h-7 min-w-[150px] justify-between text-xs">
            <span className="truncate">{value}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-64 overflow-auto text-xs">
          {items.map((item) => (
            <DropdownMenuItem
              key={String(item.id)}
              onClick={() => onSelect(item.id)}
              className="flex items-center justify-between text-[11px] py-1.5"
            >
              <span className="truncate pr-2">{item.name}</span>
              {selectedId === item.id && <Check className="h-3 w-3 text-primary flex-shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
