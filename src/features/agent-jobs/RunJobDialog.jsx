import { useState, useEffect } from 'react';
import { JOB_CLIS } from '../../lib/agentClis';
import { plural } from '../../lib/plural';
import { invoke } from '@tauri-apps/api/core';
import { Add, ArrowDown, ArrowUp, Check, ChevronDown, Close } from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { PanelButton } from '../../components/instrument/PanelButton';
import { Lamp } from '../../components/instrument/Lamp';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { cn } from '../../lib/utils';
import { basename } from '../../utils/pathUtils';
import { useToast } from '../toast';
import { useAgentJobs } from './AgentJobsContext';
import { ChunkBody } from '../plans/ChunkRow';

const blankStep = (cli = 'claude') => ({ cli, prompt: '' });

// Compose or edit a job: an ordered list of agent prompts run one after another
// in the repo. Run it once, or save it as a recipe to run again from the pane.
export function RunJobDialog({ open, onOpenChange, repoPath, recipe = null }) {
  const { launchJob, saveRecipe } = useAgentJobs();
  const toast = useToast();
  const [name, setName] = useState('');
  const [steps, setSteps] = useState(() => [blankStep()]);
  const [availableClis, setAvailableClis] = useState(null); // null = not probed yet

  // On open: start blank, or from the recipe being edited.
  useEffect(() => {
    if (!open) return;
    setName(recipe?.name ?? '');
    setSteps(recipe?.steps?.length ? recipe.steps.map((s) => ({ ...s })) : [blankStep()]);
  }, [open, recipe]);

  // Probe which agent CLIs are installed. A failed probe leaves the option
  // enabled rather than hiding a working agent.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const found = await Promise.all(
        JOB_CLIS.map(async (o) => {
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

  const filled = steps.filter((s) => s.prompt.trim());
  const canRun = !!repoPath && filled.length > 0;
  const canSave = canRun && name.trim().length > 0;

  const patchStep = (i, patch) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeStep = (i) => setSteps((prev) => prev.filter((_, j) => j !== i));
  const moveStep = (i, by) =>
    setSteps((prev) => {
      const next = [...prev];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  // A new step keeps the previous step's agent.
  const addStep = () => setSteps((prev) => [...prev, blankStep(prev[prev.length - 1]?.cli)]);

  const fallbackLabel = () => {
    const line = filled[0]?.prompt.trim().replace(/\s+/g, ' ') ?? 'Agent job';
    return line.length > 60 ? `${line.slice(0, 57)}...` : line;
  };

  const handleRun = async () => {
    if (!canRun) return;
    try {
      await launchJob({ steps: filled, label: name.trim() || fallbackLabel(), repoPath });
      onOpenChange(false);
    } catch (err) {
      toast.error(`Could not start job: ${err.message || err}`);
    }
  };

  const handleSave = async ({ run = false } = {}) => {
    if (!canSave) return;
    const id = saveRecipe({ id: recipe?.id, name, repoPath, steps: filled });
    onOpenChange(false);
    if (!run) {
      toast.success(`Saved recipe ${name.trim()}`);
      return;
    }
    // The recipe lands in state on the next render; run from the same steps.
    try {
      await launchJob({ steps: filled, label: name.trim(), repoPath, recipeId: id });
    } catch (err) {
      toast.error(`Could not start job: ${err.message || err}`);
    }
  };

  // The one main action: with a name the job is kept, without it it runs once.
  const primary = recipe || name.trim() ? 'save-run' : 'run';
  const runPrimary = () => (primary === 'run' ? handleRun() : handleSave({ run: true }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="max-h-[85vh] flex flex-col gap-4"
        status={plural(filled.length, 'step')}
        hints={[{ keys: ['^', '↵'], label: primary === 'run' ? 'run once' : 'save & run' }]}
        escLabel="cancel"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            runPrimary();
          }
        }}
      >
        <DialogHeader className="shrink-0 gap-0">
          <DialogTitle>{recipe ? `Edit ${recipe.name}` : 'Run background agents'}</DialogTitle>
          <DialogDescription>
            Each step&apos;s agent runs headless in {repoPath ? basename(repoPath) : 'the repo'}, top to bottom.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden">
          <label htmlFor="job-name" className="flex items-center gap-3">
            <span className="engraved-label w-12 shrink-0">Name</span>
            <span className="relative min-w-0 flex-1">
              <input
                id="job-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Release checks"
                className={cn(WELL_INPUT, 'pr-28')}
              />
              {!recipe && !name.trim() && (
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-muted-foreground">
                  to save as recipe
                </span>
              )}
            </span>
          </label>

          {/* The run order, drawn as the plans' chunk spine: a step with a
              prompt is a solid ring, an empty one a dashed ring and is skipped. */}
          <ol className="-mx-3 flex flex-col">
            {steps.map((step, i) => {
              const ready = !!step.prompt.trim();
              return (
                <li key={i} className="ins-spine group/step relative">
                  <div className={STEP_ROW}>
                    <span className="flex h-6 w-3.5 items-center justify-center">
                      <ChunkBody body={ready ? 'next' : 'queued'} label={ready ? `Step ${i + 1} ready` : `Step ${i + 1} empty, skipped`} />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex h-6 items-center gap-2">
                        <span className="w-4 font-[family-name:var(--font-legend)] text-[11px] tabular-nums text-[var(--ins-legend)]">{i + 1}</span>
                        <Picker
                          value={JOB_CLIS.find((o) => o.value === step.cli)?.label ?? step.cli}
                          items={JOB_CLIS.map((o) => ({
                            id: o.value,
                            name: availableClis && !availableClis.has(o.value) ? `${o.label} (not found)` : o.label,
                          }))}
                          selectedId={step.cli}
                          onSelect={(cli) => patchStep(i, { cli })}
                          label={`Step ${i + 1} agent`}
                        />
                        <span className="ml-auto flex items-center gap-0.5 opacity-60 transition-opacity group-hover/step:opacity-100 group-focus-within/step:opacity-100">
                          <PanelButton icon={ArrowUp} disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label={`Move step ${i + 1} up`} />
                          <PanelButton
                            icon={ArrowDown}
                            disabled={i === steps.length - 1}
                            onClick={() => moveStep(i, 1)}
                            aria-label={`Move step ${i + 1} down`}
                          />
                          <PanelButton icon={Close} disabled={steps.length === 1} onClick={() => removeStep(i)} aria-label={`Remove step ${i + 1}`} />
                        </span>
                      </div>
                      <textarea
                        value={step.prompt}
                        onChange={(e) => patchStep(i, { prompt: e.target.value })}
                        rows={3}
                        aria-label={`Step ${i + 1} prompt`}
                        placeholder={i === 0 ? 'e.g. Update the dependencies and fix what breaks.' : 'e.g. Run the tests and fix any failures.'}
                        className={cn(WELL_INPUT, 'h-auto resize-y py-2 leading-relaxed')}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
            {/* The spine ends on the add key; a failure anywhere above ends the run early. */}
            <li className="ins-spine relative">
              <div className={STEP_ROW}>
                <span className="flex h-6 w-3.5 items-center justify-center text-muted-foreground">
                  <Add size={11} aria-hidden="true" />
                </span>
                <div className="flex h-6 items-center gap-3">
                  <PanelButton onClick={addStep}>Add step</PanelButton>
                  <span className="text-[11px] text-muted-foreground">a failing step stops the run</span>
                </div>
              </div>
            </li>
          </ol>
        </div>

        {/* Jobs are spawned with each CLI's auto-approve flag (agent_runner
            commands.rs), so nothing stops a tool call. Said before Run. */}
        <div className="flex shrink-0 items-start gap-2.5 border-t border-[var(--ins-edge)] pt-3 text-[12px] leading-relaxed" role="alert">
          <Lamp state="warn" className="mt-[3px]" />
          <span className="text-foreground">
            Unattended, auto-approved and not sandboxed:{' '}
            <span className="text-[var(--ins-warn)]">each agent edits your working tree directly and can run any command.</span>
          </span>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!recipe && (
            <Button variant={primary === 'run' ? 'default' : 'outline'} size="sm" onClick={handleRun} disabled={!canRun}>
              Run once
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => handleSave()} disabled={!canSave}>
            Save
          </Button>
          <Button
            variant={primary === 'save-run' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSave({ run: true })}
            disabled={!canSave}
           
          >
            Save &amp; run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Body column, then the step; px-3 puts the body on the .ins-spine line.
const STEP_ROW = 'grid min-w-0 grid-cols-[14px_minmax(0,1fr)] items-start gap-x-2.5 px-3 pb-3';

const WELL_INPUT =
  'ins-well h-7 w-full min-w-0 px-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1';

function Picker({ value, items, selectedId, onSelect, label, disabled = false }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="ghost" size="sm" aria-label={label} className="h-6 min-w-0 gap-1.5 px-1.5">
          <span className="ins-name truncate text-[14px] text-foreground">{value}</span>
          <ChevronDown size={12} className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-auto text-xs">
        {items.map((item) => (
          <DropdownMenuItem
            key={String(item.id)}
            onClick={() => onSelect(item.id)}
            className="flex items-center justify-between text-[11px] py-1.5"
          >
            <span className="truncate pr-2">{item.name}</span>
            {selectedId === item.id && <Check size={12} className="text-[var(--ins-lamp)] flex-shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
