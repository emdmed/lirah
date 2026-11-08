import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import { Check, DataTransferBoth, NavArrowDown, Trash, Undo } from 'iconoir-react';
import { cn } from '../../lib/utils';
import { Lamp } from '../../components/instrument/Lamp';
import { Scanner } from '../../components/instrument/Scanner';
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
import { splitTaskText, TASK_STATUS, taskText } from './taskModel';
import '../markdown/markdown.css';

// Lazy: markdown parsing is ~100 KB and must stay out of startup JS.
const Markdown = lazy(() =>
  Promise.all([import('react-markdown'), import('remark-gfm')]).then(([md, gfm]) => ({
    default: ({ children }) => <md.default remarkPlugins={[gfm.default]}>{children}</md.default>,
  })),
);

const LAMP = {
  [TASK_STATUS.BACKLOG]: { state: 'off', label: 'backlog' },
  [TASK_STATUS.PLANNING]: { state: 'on', blink: true, label: 'planning' },
  [TASK_STATUS.PLANNED]: { state: 'ok', label: 'planned' },
  [TASK_STATUS.DONE]: { state: 'ok', settled: true, label: 'done' },
};

const ICON_BTN = 'flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-default';

/**
 * One task. Click (or Enter on the cursor) opens it: the story in full, a
 * click away from editing. `formatting` is on while a model rewrites it; the plan button sends it to the active tab's agent with the default
 * plan context, its arrow picks another and what follows the plan:
 * `chunkMode` 'chunks' (import and split it) or 'file' (leave the file), null
 * outside a git repo, where only the file is possible. `drag` is
 * useDragReorder's result, null for rows that don't reorder (done tasks).
 */
export const TaskRow = memo(function TaskRow({
  task, index, open, cursor, drag, formatting, moveLabel, onToggleOpen, onEdit, onPlan, onDone, onMove, onRemove, onOpenPlan,
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
        <span className="flex h-[18px] shrink-0 items-center">
          <Lamp state={lamp.state} blink={lamp.blink} settled={lamp.settled} label={lamp.label} />
        </span>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className={cn(
            'min-w-0 flex-1 text-left text-[13px] leading-[18px] cursor-pointer outline-none',
            done ? 'text-muted-foreground line-through' : 'text-foreground',
            !open && 'line-clamp-2',
          )}
        >
          {task.title}
        </button>
        {formatting && <span className="flex h-[18px] shrink-0 items-center"><Scanner size="sm" label="Formatting as a user story" /></span>}
        {/* Closed rows float the actions over the title's end so hidden buttons don't steal its width. */}
        <span className={cn(
          'flex shrink-0 items-center gap-0.5',
          !open && 'absolute right-3 top-2 h-[18px] bg-[color-mix(in_srgb,var(--foreground)_5%,var(--ins-panel))] pl-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        )}>
          {!done && (
            <span className="flex items-center">
              <button
                type="button"
                onClick={() => onPlan(task, defaultId)}
                className="tui-btn px-1"
                title={`Send to the active tab's agent to plan, with the default plan context${chunkMode === 'chunks' ? ', then split it into chunks' : ''}`}
              >
                plan
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={ICON_BTN} title="Plan with another context" aria-label="Plan with another context">
                    <NavArrowDown className="h-3 w-3" />
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
            {done ? <Undo className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          </button>
          {moveLabel && (
            <button type="button" onClick={() => onMove(task)} className={ICON_BTN} title={moveLabel} aria-label={moveLabel}>
              <DataTransferBoth className="h-3 w-3" />
            </button>
          )}
          <button type="button" onClick={() => onRemove(task)} className={ICON_BTN} title="Delete task" aria-label="Delete task">
            <Trash className="h-3 w-3" />
          </button>
        </span>
      </div>

      {(task.status === TASK_STATUS.PLANNING || task.status === TASK_STATUS.PLANNED) && task.planPath && (
        <div className="flex min-w-0 items-center gap-2 pl-5 font-[family-name:var(--font-legend)] text-[11px] leading-4 text-muted-foreground">
          <span className="truncate" title={task.planPath}>
            {task.status === TASK_STATUS.PLANNING ? 'waiting for ' : ''}{basename(task.planPath)}
            {task.status === TASK_STATUS.PLANNING && task.autoChunk ? ', then chunks' : ''}
          </span>
          {task.status === TASK_STATUS.PLANNED && (
            <button
              type="button"
              onClick={() => onOpenPlan(task)}
              className="tui-btn ml-auto shrink-0"
            >
              {task.planId ? 'open plan' : 'import & chunk'}
            </button>
          )}
        </div>
      )}

      {open ? (
        <TaskEditor task={task} onEdit={onEdit} />
      ) : (
        task.notes && <TaskNotes notes={task.notes} className="line-clamp-2 [&>:first-child]:mt-0" />
      )}
    </div>
  );
});

function TaskNotes({ notes, className }) {
  return (
    <div className={cn('markdown-body markdown-compact pl-5 text-muted-foreground', className)}>
      <Suspense fallback={<p className="whitespace-pre-wrap">{notes}</p>}>
        <Markdown>{notes}</Markdown>
      </Suspense>
    </div>
  );
}

// The story rendered; click it to edit the whole text in one field. Saved on
// blur or Ctrl+Enter, Esc puts it back.
function TaskEditor({ task, onEdit }) {
  const [text, setText] = useState(null); // null: reading
  const original = taskText(task);

  const save = () => {
    const next = splitTaskText(text);
    setText(null);
    if (next.title && text.trim() !== original) onEdit(task, next);
  };

  if (text === null) {
    return (
      <div className="flex flex-col gap-1">
        {task.notes && <TaskNotes notes={task.notes} />}
        <button
          type="button"
          onClick={() => setText(original)}
          className="tui-btn ml-5 self-start"
        >
          edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 pl-5" onKeyDown={(e) => e.stopPropagation()}>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur();
          if (e.key === 'Escape') setText(null);
        }}
        autoFocus
        aria-label="Task"
        rows={8}
        className="min-h-[120px] text-xs"
      />
      <span className="text-[11px] text-muted-foreground">first line is the title · Ctrl+↵ saves and reformats · Esc cancels</span>
    </div>
  );
}
