import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { lazyNamed } from '../../lib/lazyNamed';
import { errorMessage } from '../../lib/errorMessage';
import { Scanner } from '../../components/instrument/Scanner';
import { useSetting } from '../settings/settingsStore';
import { useConfirm } from '../dialogs/DialogProvider';
import { getAgentHookState } from '../tabs/agentHookState';
import { getTabSession } from '../tabs/terminalActivity';
import { invoke } from '@tauri-apps/api/core';
import { Textarea } from '../../components/ui/textarea';
import { useAutoGrow } from '../../hooks/useAutoGrow';
import { useRowCursor } from '../../hooks/useRowCursor';
import { basename } from '../../utils/pathUtils';
import { useToast } from '../toast';
import { useTabManager } from '../tabs/TabContext';
import { useDragReorder } from '../tabs/useDragReorder';
import { EmptyLine } from '../plans/parts';
import { buildTaskPlanPrompt } from '../plans/planPrompts';
import { requestPlanFocus } from '../plans/plansPaneEvents';
import { planContext } from './planContexts';
import { useTasks } from './TasksContext';
import { GLOBAL, isOpen, planFileName, splitTaskText, TASK_STATUS } from './taskModel';
import { subscribeQuickTask, takeQuickTask } from './tasksPaneEvents';
import { TaskRow } from './TaskRow';
import { useProjectScope } from './useProjectScope';

const PlanContextsDialog = lazyNamed(() => import('./PlanContextsDialog'), 'PlanContextsDialog');

/** The backlog: this workspace's tasks or the global ones, a key away from a plan. */
export function TasksPane({ projectPath }) {
  const { scope: projectScope, isRepo } = useProjectScope(projectPath);
  const { tabs, activeTabId, workspaces, activeWorkspaceId } = useTabManager();
  const [view, setView] = useState('project'); // 'project' (this workspace) | 'global'
  const scope = view === 'global' ? GLOBAL : activeWorkspaceId;
  const otherScope = view === 'global' ? activeWorkspaceId : GLOBAL;

  const {
    tasks, addTask, updateTask, removeTask, restoreTask, reorderTasks, moveToScope, planTask, importTaskPlan, formatTask,
  } = useTasks(scope);
  const { tasks: otherTasks } = useTasks(otherScope);
  const toast = useToast();
  const confirm = useConfirm();

  const [openId, setOpenId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [contextsOpen, setContextsOpen] = useState(false);
  const [chunkSetting, setAutoChunk] = useSetting('autoChunkTaskPlans');
  // Chunks live in the plans pane, which needs git.
  const autoChunk = isRepo && chunkSetting;

  // Quick add: Enter saves; Shift+Enter starts a new line.
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  // Two lines to start, growing to six as you write; it scrolls after that.
  useAutoGrow(inputRef, text, { maxLines: 6 });

  // Saved text is rewritten as a user story in the background; these rows show it.
  const [formatting, setFormatting] = useState(() => new Set());
  const handleFormat = useCallback(async (id) => {
    setFormatting((s) => new Set(s).add(id));
    try {
      const cwd = projectScope || await invoke('get_home_dir');
      await formatTask(scope, id, cwd);
    } catch (e) {
      toast.error(`Couldn't format the task, kept as written: ${errorMessage(e)}`);
    } finally {
      setFormatting((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }, [formatTask, scope, projectScope, toast]);

  const focusQuickAdd = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Alt+Q and the palette's `task`: open on this project's list, ready to type.
  useEffect(() => {
    const take = () => {
      const request = takeQuickTask();
      if (request === null) return;
      setView('project');
      if (typeof request === 'string') setText(request);
      focusQuickAdd();
    };
    take();
    return subscribeQuickTask(take);
  }, [focusQuickAdd]);

  const submit = async () => {
    if (!text.trim() || !scope) return;
    const id = await addTask(scope, { ...splitTaskText(text), repos: scope !== GLOBAL && projectScope ? [projectScope] : [] });
    setText('');
    focusQuickAdd();
    if (id) handleFormat(id);
  };

  const openTasks = useMemo(() => (tasks || []).filter(isOpen), [tasks]);
  const doneTasks = useMemo(() => (tasks || []).filter((t) => !isOpen(t)), [tasks]);
  const openIds = useMemo(() => openTasks.map((t) => t.id), [openTasks]);
  const rows = useMemo(() => (showDone ? [...openTasks, ...doneTasks] : openTasks), [openTasks, doneTasks, showDone]);

  const reorder = useCallback((from, to) => reorderTasks(scope, openIds, from, to), [reorderTasks, scope, openIds]);
  const { dragIndex, onDragStart, onDragOver, onDrop, endDrag, dropLineAt } = useDragReorder(reorder);
  const drag = useMemo(
    () => ({ dragIndex, onDragStart, onDragOver, onDrop, endDrag, dropLineAt }),
    [dragIndex, onDragStart, onDragOver, onDrop, endDrag, dropLineAt]
  );

  const handlePlan = useCallback(async (task, contextId) => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || !projectScope) {
      toast.error('Open a project tab with an agent to plan in');
      return;
    }
    const tabName = tab.customLabel || tab.label;
    // The prompt is typed into the terminal: make sure an agent is there to read it.
    const agent = getAgentHookState(getTabSession(activeTabId));
    if (!agent || agent.state === 'working') {
      const ok = await confirm({
        title: agent ? `The agent in ${tabName} is busy` : `No agent detected in ${tabName}`,
        description: agent
          ? 'The task will be queued behind what the agent is doing.'
          : 'The task is typed into this tab\'s terminal. Launch an agent there first (Ctrl+K), or send anyway if one is already running.',
        confirmLabel: 'Send anyway',
        destructive: false,
      });
      if (!ok) return;
    }
    try {
      const planPath = await planTask(scope, task.id, { tabId: activeTabId, root: projectScope, contextId, autoChunk });
      toast.success(`Sent to ${tabName}: ${autoChunk ? 'the plan is split into chunks once written' : `the plan goes to ${basename(planPath)}`}`);
    } catch (e) {
      // Not sent: the prompt is still useful on the clipboard.
      const planPath = `${projectScope}/${planFileName(task)}`;
      const text = buildTaskPlanPrompt({ task, context: planContext(contextId)?.text, planPath, autoChunk });
      const copied = await navigator.clipboard.writeText(text).then(() => true, () => false);
      toast.error(`Couldn't send the task: ${errorMessage(e)}.${copied ? ' The prompt is on the clipboard.' : ''}`);
    }
  }, [tabs, activeTabId, projectScope, planTask, scope, toast, confirm, autoChunk]);

  const handleEdit = useCallback((task, patch) => {
    updateTask(scope, task.id, patch);
    handleFormat(task.id);
  }, [updateTask, scope, handleFormat]);

  const handleDone = useCallback((task) => {
    const back = task.status === TASK_STATUS.DONE;
    const status = back ? (task.planPath ? TASK_STATUS.PLANNED : TASK_STATUS.BACKLOG) : TASK_STATUS.DONE;
    updateTask(scope, task.id, { status });
  }, [updateTask, scope]);

  const handleRemove = useCallback((task) => {
    const removed = removeTask(scope, task.id);
    if (!removed) return;
    toast.info(`Deleted "${task.title}"`, {
      duration: 8000,
      action: { label: 'undo', onClick: () => restoreTask(scope, removed.task, removed.index) },
    });
  }, [removeTask, restoreTask, scope, toast]);

  const workspaceName = workspaces.find((w) => w.id === activeWorkspaceId)?.name || 'workspace';
  const moveLabel = otherScope ? (view === 'global' ? 'Move to this workspace' : 'Move to global tasks') : null;
  const handleMove = useCallback((task) => {
    if (!otherScope) return;
    moveToScope(scope, otherScope, task.id);
    toast.info(view === 'global' ? `Moved to ${workspaceName}` : 'Moved to global tasks');
  }, [moveToScope, scope, otherScope, view, toast, workspaceName]);

  // Linked: show the plan. Not imported yet: import it here, which splits it.
  const handleOpenPlan = useCallback(async (task) => {
    if (task.planId) {
      requestPlanFocus(task.planId);
      return;
    }
    try {
      const planId = await importTaskPlan(scope, task.id);
      toast.success(`Imported "${task.title}", splitting into chunks`, {
        action: { label: 'open', onClick: () => requestPlanFocus(planId) },
      });
    } catch (e) {
      toast.error(`Couldn't import the plan: ${errorMessage(e)}`);
    }
  }, [importTaskPlan, scope, toast]);

  const toggleOpen = useCallback((id) => setOpenId((cur) => (cur === id ? null : id)), []);

  // j/k over the rows, Enter opens one, p plans it with the default context.
  const { containerRef, registerList, onKeyDown: onCursorKey, onBlur, cursorIndex } = useRowCursor();
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    registerList({
      count: rows.length,
      activate: (i) => rowsRef.current[i] && toggleOpen(rowsRef.current[i].id),
      pin: (i) => {
        const task = rowsRef.current[i];
        if (task && isOpen(task)) handlePlan(task);
      },
      scrollToIndex: () => {},
    });
  }, [rows.length, registerList, toggleOpen, handlePlan]);
  useEffect(() => () => registerList(null), [registerList]);

  const onPaneKey = (e) => {
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    if ((e.key === 'n' || e.key === 'a') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      focusQuickAdd();
      return;
    }
    onCursorKey(e);
  };

  const count = (list) => (list || []).filter(isOpen).length;
  const projectCount = view === 'global' ? count(otherTasks) : count(tasks);
  const globalCount = view === 'global' ? count(tasks) : count(otherTasks);

  const renderRow = (task, index, rowDrag) => (
    <TaskRow
      key={task.id}
      task={task}
      index={index}
      open={openId === task.id}
      cursor={cursorIndex === (rowDrag ? index : openTasks.length + index)}
      drag={rowDrag}
      moveLabel={moveLabel}
      onToggleOpen={() => toggleOpen(task.id)}
      formatting={formatting.has(task.id)}
      onEdit={handleEdit}
      onPlan={handlePlan}
      onDone={handleDone}
      onMove={handleMove}
      onRemove={handleRemove}
      onOpenPlan={handleOpenPlan}
      chunkMode={isRepo ? (chunkSetting ? 'chunks' : 'file') : null}
      onChunkMode={(mode) => setAutoChunk(mode === 'chunks')}
      onEditContexts={() => setContextsOpen(true)}
    />
  );

  return (
    <div ref={containerRef} tabIndex={-1} onKeyDown={onPaneKey} onBlur={onBlur} className="flex flex-col outline-none">
      <div className="flex items-center gap-1 px-3 pt-2 pb-1.5 text-[11px]">
        <ScopeButton active={view === 'project'} onClick={() => setView('project')} label={workspaceName} count={projectCount} />
        <ScopeButton active={view === 'global'} onClick={() => setView('global')} label="global" count={globalCount} />
        <button
          type="button"
          onClick={() => setContextsOpen(true)}
          className="tui-btn ml-auto text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
          title="Edit the plan contexts sent with a task"
        >
          contexts
        </button>
      </div>

      <form
        className="flex flex-col gap-1.5 px-3 pb-2 edge-b-engraved"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.currentTarget.blur();
            }
          }}
          disabled={!scope}
          rows={2}
          placeholder={view === 'global' ? 'Add a global task…' : `Add a task to ${workspaceName}…`}
          aria-label="New task"
          className="min-h-12 resize-none py-1.5 text-xs leading-[18px]"
        />
        {text.trim() && (
          <span className="text-[11px] text-muted-foreground">
            ↵ save · ⇧↵ new line · formatted as a user story
          </span>
        )}
      </form>

      {!tasks ? (
        scope ? (
          <div className="flex justify-center py-4"><Scanner size="md" label="Loading tasks" /></div>
        ) : (
          <EmptyLine hint="open a project tab to keep its tasks">no project</EmptyLine>
        )
      ) : openTasks.length === 0 && doneTasks.length === 0 ? (
        <EmptyLine hint="jot it down, then send it to an agent to plan with [plan]. Alt+Q adds from anywhere">
          no tasks
        </EmptyLine>
      ) : (
        <div className="flex flex-col">
          {openTasks.map((task, i) => renderRow(task, i, drag))}
          {openTasks.length === 0 && <EmptyLine>backlog clear</EmptyLine>}
          {doneTasks.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="flex items-center gap-1.5 px-3 pt-2.5 pb-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer edge-b-engraved"
              >
                {showDone ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span className="engraved-label">done</span>
                <span className="font-mono tabular-nums">{doneTasks.length}</span>
              </button>
              {showDone && doneTasks.map((task, i) => renderRow(task, i, null))}
            </>
          )}
        </div>
      )}

      <Suspense fallback={null}>
        {contextsOpen && <PlanContextsDialog open onOpenChange={setContextsOpen} />}
      </Suspense>
    </div>
  );
}

function ScopeButton({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex max-w-[45%] items-center gap-1.5 px-1.5 py-0.5 font-mono text-[11px] leading-4 cursor-pointer',
        active ? 'text-[var(--ins-lamp)] shadow-[inset_0_0_0_1px_var(--ins-lamp)]' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="truncate">{label}</span>
      {count > 0 && <span className="tabular-nums text-foreground">{count}</span>}
    </button>
  );
}
