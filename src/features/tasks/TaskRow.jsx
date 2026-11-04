import { memo, useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Check, ChevronDown, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Lamp } from '../../components/instrument/Lamp';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { basename } from '../../utils/pathUtils';
import { usePlanContexts } from './planContexts';
import { TASK_STATUS } from './taskModel';

const LAMP = {
  [TASK_STATUS.BACKLOG]: { state: 'off', label: 'backlog' },
  [TASK_STATUS.PLANNING]: { state: 'on', blink: true, label: 'planning' },
  [TASK_STATUS.PLANNED]: { state: 'ok', label: 'planned' },
  [TASK_STATUS.DONE]: { state: 'ok', settled: true, label: 'done' },
};

const ICON_BTN = 'flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-default';

/**
 * One task. Click (or Enter on the cursor) opens it to edit the title and
 * notes; the plan button sends it to the active tab's agent with the default
 * plan context, its arrow picks another and what follows the plan:
 * `chunkMode` 'chunks' (import and split it) or 'file' (leave the file), null
 * outside a git repo, where only the file is possible. `drag` is
 * useDragReorder's result, null for rows that don't reorder (done tasks).
 */
export const TaskRow = memo(function TaskRow({
  task, index, open, cursor, drag, moveLabel, onToggleOpen, onEdit, onPlan, onDone, onMove, onRemove, onOpenPlan,
  onEditContexts, chunkMode, onChunkMode,
}) {
  const { contexts, defaultId } = usePlanContexts();
  const lamp = LAMP[task.status] || LAMP.backlog;
  const done = task.status === TASK_STATUS.DONE;
  const dropLine = drag?.dropLineAt(index);
  const rowRef = useRef(null);

  useEffect(() => {
    if (cursor) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <div
      ref={rowRef}
      data-nav-row=""
      data-cursor={cursor || undefined}
      draggable={!!drag && !open}
      onDragStart={drag ? (e) => drag.onDragStart(e, index) : undefined}
      onDragOver={drag ? (e) => drag.onDragOver(e, index) : undefined}
      onDrop={drag?.onDrop}
      onDragEnd={drag?.endDrag}
      className={cn(
        'group relative flex flex-col gap-1.5 px-3 py-2 text-[11px] edge-b-engraved',
        !open && 'hover:bg-foreground/5',
        drag?.dragIndex === index && 'opacity-50',
      )}
    >
      {dropLine && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 z-10 h-px bg-[var(--ins-lamp)]',
            dropLine === 'after' ? 'bottom-0' : 'top-0',
          )}
        />
      )}
      <div className="flex min-w-0 items-start gap-2">
        <span className="flex h-4 shrink-0 items-center">
          <Lamp state={lamp.state} blink={lamp.blink} settled={lamp.settled} label={lamp.label} />
        </span>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className={cn(
            'min-w-0 flex-1 text-left text-xs leading-4 cursor-pointer outline-none',
            done ? 'text-muted-foreground line-through' : 'text-foreground',
            !open && 'line-clamp-2',
          )}
          title={task.notes || undefined}
        >
          {task.title}
        </button>
        <span className={cn('flex shrink-0 items-center gap-0.5', !open && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100')}>
          {!done && (
            <span className="flex items-center">
              <button
                type="button"
                onClick={() => onPlan(task, defaultId)}
                className="tui-btn px-1 text-[11px] text-muted-foreground hover:text-[var(--ins-lamp)] cursor-pointer"
                title={`Send to the active tab's agent to plan, with the default plan context${chunkMode === 'chunks' ? ', then split it into chunks' : ''}`}
              >
                plan
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={ICON_BTN} title="Plan with another context" aria-label="Plan with another context">
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[240px]">
                  <DropdownMenuLabel className="text-xs">Then</DropdownMenuLabel>
                  {chunkMode ? (
                    <DropdownMenuRadioGroup value={chunkMode} onValueChange={onChunkMode}>
                      <DropdownMenuRadioItem value="chunks" onSelect={(e) => e.preventDefault()} className="cursor-pointer text-xs">
                        Split into chunks
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="file" onSelect={(e) => e.preventDefault()} className="cursor-pointer text-xs">
                        Keep the plan file
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  ) : (
                    <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">
                      Keep the plan file. Chunks need a git repository.
                    </p>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Plan with</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {contexts.map((c) => (
                    <DropdownMenuItem key={c.id} onSelect={() => onPlan(task, c.id)} className="cursor-pointer text-xs">
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {c.id === defaultId && <span className="text-[11px] text-muted-foreground">default</span>}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onEditContexts} className="cursor-pointer text-xs text-muted-foreground">
                    Edit plan contexts…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          )}
          <button
            type="button"
            onClick={() => onDone(task)}
            className={ICON_BTN}
            title={done ? 'Back to the backlog' : 'Mark done'}
            aria-label={done ? 'Back to the backlog' : 'Mark done'}
          >
            {done ? <RotateCcw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          </button>
          {moveLabel && (
            <button type="button" onClick={() => onMove(task)} className={ICON_BTN} title={moveLabel} aria-label={moveLabel}>
              <ArrowRightLeft className="h-3 w-3" />
            </button>
          )}
          <button type="button" onClick={() => onRemove(task)} className={ICON_BTN} title="Delete task" aria-label="Delete task">
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      </div>

      {(task.status === TASK_STATUS.PLANNING || task.status === TASK_STATUS.PLANNED) && task.planPath && (
        <div className="flex min-w-0 items-center gap-2 pl-5 text-[11px] text-muted-foreground">
          <span className="truncate" title={task.planPath}>
            {task.status === TASK_STATUS.PLANNING ? 'waiting for ' : ''}{basename(task.planPath)}
            {task.status === TASK_STATUS.PLANNING && task.autoChunk ? ', then chunks' : ''}
          </span>
          {task.status === TASK_STATUS.PLANNED && (
            <button
              type="button"
              onClick={() => onOpenPlan(task)}
              className="tui-btn ml-auto shrink-0 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {task.planId ? 'open plan' : 'import & chunk'}
            </button>
          )}
        </div>
      )}

      {open ? (
        <TaskEditor task={task} onEdit={onEdit} />
      ) : (
        task.notes && <p className="line-clamp-2 whitespace-pre-wrap pl-5 text-[11px] leading-snug text-muted-foreground">{task.notes}</p>
      )}
    </div>
  );
});

// Title and notes, saved on blur.
function TaskEditor({ task, onEdit }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setNotes(task.notes), [task.notes]);

  const saveTitle = () => {
    const t = title.trim();
    if (!t) setTitle(task.title);
    else if (t !== task.title) onEdit(task, { title: t });
  };
  const saveNotes = () => {
    if (notes.trim() !== task.notes) onEdit(task, { notes: notes.trim() });
  };

  return (
    <div className="flex flex-col gap-1.5 pl-5" onKeyDown={(e) => e.stopPropagation()}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setTitle(task.title);
            e.currentTarget.blur();
          }
        }}
        aria-label="Task title"
        className="h-7 text-xs"
      />
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={saveNotes}
        placeholder="Notes: context, links, acceptance criteria…"
        aria-label="Task notes"
        rows={4}
        className="min-h-[72px] text-xs"
      />
    </div>
  );
}
