import { useState, useMemo, useEffect } from 'react';
import { plural } from '../../lib/plural';
import { invoke } from '@tauri-apps/api/core';
import { git } from '../../lib/git';
import { Bot, ChevronDown, Check, GitBranch, FolderGit2, Pin, ListTree, FolderInput } from 'lucide-react';
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
import { PanelButton } from '../../components/instrument/PanelButton';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';
import { Lamp } from '../../components/instrument/Lamp';
import { KeyChord } from '../../components/instrument/Keycap';
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
  selected: { label: 'tree', hint: 'select in the tree', icon: ListTree },
  pinned: { label: 'pinned', hint: 'pin a file', icon: Pin },
  group: { label: 'group', hint: 'add a group', icon: FolderInput },
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
  const { jobs, launchRace, selectedContextFiles, findOverlappingJobs } = useAgentJobs();

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
    git(projectPath, ['rev-parse', '--is-inside-work-tree'])
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
    // findOverlappingJobs is stable and reads the latest jobs; `jobs` is a
    // dep so the warning tracks jobs finishing, applying or being discarded.
    [open, findOverlappingJobs, projectPath, modifiablePaths, jobs]
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

  const isolationHint = !isGitRepo
    ? 'Not a git repository — runs in place, no diff review.'
    : useWorktree
    ? 'Changes stay in a separate worktree until you apply them.'
    : 'Edits your working tree directly.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[520px] max-w-[95vw] max-h-[85vh] flex flex-col gap-4 overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canRun) {
            e.preventDefault();
            handleRun();
          }
        }}
      >
        <DialogHeader className="shrink-0 gap-0">
          <DialogTitle>Run background agent</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Runs a headless agent and streams its output to the Jobs panel. You review the changes
            before they reach your working tree.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor="job-name">
              <input
                id="job-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={template?.title || 'Optional'}
                className={WELL_INPUT}
              />
            </Field>
            <Field label="Template">
              <Picker
                value={template?.title || 'None'}
                items={[{ id: null, name: 'None' }, ...templates.map((t) => ({ id: t.id, name: t.title }))]}
                selectedId={templateId}
                onSelect={setTemplateId}
              />
            </Field>
          </div>

          {/* Context files: tree selection + pinned, with groups as an add-in */}
          <Field
            label="Context files"
            count={checkedFiles.length}
            action={
              groups.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <PanelButton icon={FolderInput}>
                      Add group
                      <ChevronDown aria-hidden="true" className="opacity-60" />
                    </PanelButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-64 overflow-auto text-xs">
                    {groups.map((g) => (
                      <DropdownMenuItem
                        key={g.id}
                        onClick={() => addGroup(g)}
                        className="flex justify-between gap-4 text-[11px] py-1.5"
                      >
                        <span className="truncate">{g.name}</span>
                        <span className="tube-idle">{g.files.length}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            }
          >
            <div className="ins-well max-h-40 overflow-auto py-1">
              {candidates.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 px-3 py-4 text-center text-[11px] text-muted-foreground">
                  <span className="text-foreground/80">No files in context</span>
                  <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                    {Object.values(SOURCE_META).map(({ hint, icon: Icon }) => (
                      <span key={hint} className="inline-flex items-center gap-1">
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {hint}
                      </span>
                    ))}
                  </span>
                </div>
              ) : (
                candidates.map((f) => {
                  const meta = SOURCE_META[f.source] || SOURCE_META.selected;
                  const Icon = meta.icon;
                  const isOn = checked.has(f.relativePath);
                  const slash = f.relativePath.lastIndexOf('/');
                  return (
                    <label
                      key={f.relativePath}
                      className="flex cursor-pointer items-center gap-2 px-2 py-[3px] hover:bg-[color-mix(in_srgb,var(--color-foreground)_5%,transparent)]"
                    >
                      <Checkbox checked={isOn} onCheckedChange={() => toggleFile(f.relativePath)} />
                      <span className={cn('min-w-0 flex-1 truncate text-[11px]', !isOn && 'opacity-50')}>
                        <span className="text-muted-foreground">{f.relativePath.slice(0, slash + 1)}</span>
                        <span className="text-foreground">{f.relativePath.slice(slash + 1)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground" title={`From ${meta.label}`}>
                        <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                        {meta.label}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </Field>

          <Field label={template ? 'Instructions · optional' : 'Instructions'} htmlFor="job-instructions">
            <textarea
              id="job-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="e.g. Write unit tests for these files following existing conventions."
              className={cn(WELL_INPUT, 'h-auto resize-none py-2 leading-relaxed')}
            />
          </Field>

          {/* Agents: pick one, or several to race them against each other. */}
          <Field
            label={canRace ? 'Agents · pick several to race' : 'Agent'}
            action={
              canRace && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="mr-1">runs each</span>
                  {Array.from({ length: MAX_COPIES }, (_, i) => i + 1).map((n) => (
                    <PanelButton
                      key={n}
                      aria-pressed={copies === n}
                      onClick={() => setCopies(n)}
                      className={cn('w-6 tabular-nums', copies === n && 'text-[var(--ins-lamp)]')}
                      aria-label={`${n} run${n === 1 ? '' : 's'} per agent`}
                    >
                      {n}×
                    </PanelButton>
                  ))}
                </span>
              )
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {CLI_OPTIONS.map((o) => {
                const missing = availableClis && !availableClis.has(o.value);
                const on = clis.has(o.value);
                return (
                  <PanelButton
                    key={o.value}
                    latched={on}
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
                      on && 'text-foreground',
                      missing && !on && 'cursor-not-allowed opacity-40 line-through'
                    )}
                  >
                    {o.label}
                  </PanelButton>
                );
              })}
            </div>
          </Field>

          <div className="flex items-center gap-3 edge-engraved px-3 py-2.5">
            <ToggleSwitch
              checked={useWorktree}
              onChange={(v) => isGitRepo && setUseWorktree(v)}
              disabled={!isGitRepo}
              tone="lamp"
              label="Isolated worktree"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs text-foreground">
                {useWorktree ? (
                  <GitBranch className="h-3 w-3 text-[var(--ins-lamp)]" aria-hidden="true" />
                ) : (
                  <FolderGit2 className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                )}
                {useWorktree ? 'Isolated worktree' : 'In place'}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{isolationHint}</div>
            </div>
          </div>

          {/* Jobs are spawned with each CLI's auto-approve flag (agent_runner
              commands.rs), so nothing stops a tool call. Say so before Run. */}
          <div
            className="flex items-start gap-2.5 edge-engraved px-3 py-2 text-[11px] leading-snug"
            role={useWorktree ? 'note' : 'alert'}
          >
            <Lamp state={useWorktree ? 'off' : 'warn'} className="mt-[3px]" />
            <span className={useWorktree ? 'text-muted-foreground' : 'text-foreground'}>
              Jobs run unattended with auto-approve: no permission prompts, and they are not
              sandboxed.{' '}
              {useWorktree ? (
                'The isolated worktree keeps edits out of your working tree until you apply them.'
              ) : (
                <span className="text-[var(--ins-warn)]">
                  In place, the agent edits your working tree directly and can run any command.
                  Isolated worktree recommended.
                </span>
              )}
            </span>
          </div>

          {candidateCount > 1 && (
            <div className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground">
              <Lamp state="on" className="mt-[3px]" />
              <span>
                <span className="text-foreground">Race · {candidateCount} candidates</span> on the same
                prompt, one worktree each. Compare the diffs and keep one; the rest are discarded.
              </span>
            </div>
          )}

          {overlaps.length > 0 && (
            <div className="flex items-start gap-2.5 edge-engraved px-3 py-2.5 text-[11px] leading-snug" role="alert">
              <Lamp state="warn" className="mt-[3px]" />
              <div className="min-w-0 flex-1">
                <div className="text-[var(--ins-warn)]">
                  Overlaps {plural(overlaps.length, 'pending job')}
                </div>
                <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                  {overlaps.map((o) => (
                    <li key={o.id} className="truncate">
                      <span className="text-foreground/80">{o.label}</span>{' '}
                      <span className="opacity-70">({o.status})</span> — {o.files.join(', ')}
                    </li>
                  ))}
                </ul>
                <div className="mt-1 text-muted-foreground/80">
                  Both jobs will edit these files and you'll have to reconcile them. Consider splitting
                  the work by file.
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 items-center sm:justify-between">
          <KeyChord keys={['^', '↵']} label="run" size="sm" className="text-[11px]" />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="px-3 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleRun} disabled={!canRun} className="min-w-[96px] px-3 text-xs">
              <Bot className="h-3 w-3" />
              {candidateCount > 1 ? `Race ${candidateCount}` : 'Run'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const WELL_INPUT =
  'ins-well h-7 w-full min-w-0 px-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1';


// A labelled form block: printed legend (with an optional count and a
// right-aligned action) above its control.
function Field({ label, count, action, htmlFor, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="ins-legend text-[10px]">
          {label}
          {count !== undefined && <span className="tube-idle ml-1.5">{count}</span>}
        </label>
        {action}
      </div>
      {children}
    </div>
  );
}

function Picker({ value, items, selectedId, onSelect, disabled = false }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="outline" size="sm" className="h-7 w-full min-w-0 justify-between px-2 text-xs">
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
            {selectedId === item.id && <Check className="h-3 w-3 text-[var(--ins-lamp)] flex-shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
