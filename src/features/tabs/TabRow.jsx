import { memo } from 'react';
import { Agent, Branch, Folder, Link } from '@/components/icons';
import { cn } from '../../lib/utils';
import { plural } from '../../lib/plural';
import { MiddleTruncate } from '../../components/MiddleTruncate';
import { ContextMoon } from '../../components/instrument/ContextMoon';
import { DiffBar } from '../../components/instrument/DiffBar';
import { activityLamp } from './tabActivity';
import { RowAction } from './RowAction';
import { isStoppedRun, rowKeys } from './rowKeys';
import { Scanner } from '../../components/instrument/Scanner';
import { Lamp } from '../../components/instrument/Lamp';
import { RenameField } from './RenameField';
import { RoleChip, RoleTagButton } from './RoleMenu';
import { WorktreeMenu } from './WorktreeMenu';
import { TurnTrail } from './TurnTrail';
import { isSettledPlan, TabPlanTier } from '../plans/TabPlanTier';

// Line counts past four digits read as a size, not a number: +146812 → +147k.
function compactCount(n) {
  if (n < 10000) return String(n);
  if (n < 1e6) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

// An auto commit stands in for the diff it is committing: a scanner while it
// stages and writes the message, a lamp once the message waits for review.
const AUTO_COMMIT = {
  // The lit lamp in place of the scanner says the message is ready.
  ready: { lamp: 'ok', title: 'Auto commit: message ready to review' },
  error: { lamp: 'fault', label: ' failed', tone: 'text-[var(--ins-fault)]', title: 'Auto commit failed' },
};

function AutoCommitMark({ stage }) {
  const settled = AUTO_COMMIT[stage];
  if (settled) {
    return (
      <span className="inline-flex items-center gap-1.5" title={settled.title}>
        <Lamp state={settled.lamp} />commit{settled.label && <span className={settled.tone}>{settled.label}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" title="Auto commit: writing the message">
      <Scanner label="auto committing" />commit
    </span>
  );
}

/** The row's right-hand readout: uncommitted lines, the context moon, the lamp. */
function Readout({ info, contextFill, autoCommit, lamp, label, className }) {
  let diff = null;
  if (autoCommit && autoCommit !== 'done') {
    diff = <AutoCommitMark stage={autoCommit} />;
  } else if (info?.branch) {
    // Clean is the resting state: an empty slot says it.
    diff = info.files === 0 ? null : (
      <span className="inline-flex" title={`${plural(info.files, 'file')} changed · +${info.added} −${info.deleted}`}>
        {info.added || info.deleted
          ? <DiffBar added={info.added} removed={info.deleted} side={24} fmt={compactCount} />
          : plural(info.files, 'file')}
      </span>
    );
  }
  // Fixed slots, so the moons line up down the pane whatever the counts are.
  return (
    <span className={cn('flex shrink-0 items-center gap-2 whitespace-nowrap font-mono tabular-nums text-muted-foreground', className)}>
      <span className="inline-flex min-w-[9ch] items-center justify-end">{diff}</span>
      <span className="inline-flex w-3 justify-center">
        {contextFill != null && <ContextMoon ratio={contextFill} />}
      </span>
      {/* 15px slot: the lamp's reticle reaches 4px past its 7px box. */}
      <span className="inline-flex w-[15px] justify-center">
        <Lamp {...lamp} label={label} />
      </span>
    </span>
  );
}

// Keys on a focused row; j/k between rows are the pane's (see TabsSummaryPane).
export const ROW_KEYS = [
  { keys: ['j', 'k'], label: 'move' },
  { keys: ['↵'], label: 'switch' },
  { keys: ['l'], label: 'link' },
  { keys: ['a'], label: 'attach' },
  { keys: ['f'], label: 'folder' },
  { keys: ['o'], label: 'plan' },
  { keys: ['p'], label: 'resume' },
  { keys: ['e'], label: 'edits' },
  { keys: ['w'], label: 'worktrees' },
  { keys: ['t'], label: 'role' },
  { keys: ['r'], label: 'rename' },
  { keys: ['x'], label: 'close' },
];

/**
 * One tab in the tabs summary pane: what it is doing, its branch, its agent's
 * latest turn, the plans it is working through and another agent working in its
 * repo. `contextFill` (0..1, or null) is its agent's context window, drawn as a
 * moon. `compact` folds a tab that is neither current nor selected to its first line. `drag` is
 * useDragReorder's result; `actions` the pane's handlers.
 * Memoized: the pane re-renders on its 1s clock, so activity and the turn
 * summary come in as primitives and a row only redraws when what it shows
 * (a running "since" or duration included) changes.
 */
export const TabRow = memo(function TabRow({
  tab, index, name, info, contextFill, autoCommit, activityKind, activityLabel, activitySince, activityQuestion, workLabel, active, linked, closable, queuePos,
  turn, summaryText, summaryRunning, trailOpen, renaming, roleMenuOpen, worktreeMenuOpen, plans, compact, drag, actions,
}) {
  const activity = { kind: activityKind, label: activityLabel, since: activitySince };
  const summary = summaryText ? { text: summaryText, running: summaryRunning } : null;
  const root = tab.projectPath.replace(/\/+$/, '');
  const linkLabel = linked ? `Unlink ${name} from the current prompt` : `Link ${name} into the current prompt`;
  const dropLine = drag.dropLineAt(index);
  const livePlans = plans?.filter((p) => !isSettledPlan(p)) ?? [];
  // With nothing live, the latest finished plan holds the card's place.
  const settledPlans = livePlans.length ? [] : plans?.filter(isSettledPlan) ?? [];
  const cardPlans = livePlans.length ? livePlans : settledPlans.slice(-1);
  const settledNote = settledPlans.length > 1 ? `${settledPlans.length} plans complete`
    : settledPlans.length ? 'plan complete' : undefined;
  const permission = activity.kind === 'permission';
  // The status line shows one thing: a permission question, the latest turn, or another agent here.
  const showTrail = summary && !permission;
  const queued = queuePos >= 0;
  const onRoleMenu = (open) => actions.setRoleMenu(open ? tab.id : null);
  const onWorktreeMenu = (open) => actions.setWorktreeMenu(open ? tab.id : null);
  const edited = turn?.edited?.size ? [...turn.edited] : null;

  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    const run = (fn) => {
      e.preventDefault();
      fn();
    };
    if (e.key === 'Enter' || e.key === ' ') return run(() => actions.switchTab(tab.id));
    const hit = rowKeys({ active, closable, edited, plans, summary, worktrees: info?.worktrees?.length }).find((k) => k.on.includes(e.key));
    if (!hit) return;
    run({
      attach: () => actions.attachEdits(edited),
      edits: () => actions.toggleTrail(tab.id),
      plan: () => actions.openPlan(tab.id, (livePlans[0] ?? plans[0]).id),
      resume: () => actions.resumePlan(plans.find(isStoppedRun)),
      link: () => actions.toggleLink(tab, name, linked),
      rename: () => actions.startRename(tab.id),
      close: () => actions.closeTab(tab.id),
      role: () => onRoleMenu(true),
      worktrees: () => onWorktreeMenu(true),
      folder: () => actions.openFolder(tab.projectPath),
    }[hit.label]);
  };

  const tooltip = [
    tab.note,
    tab.projectPath,
    `${activity.label}${activity.since ? ` · ${activity.since}` : ''}`,
    compact && info?.branch && `branch ${info.branch}`,
    summary && (compact || !showTrail) && `last turn: ${summary.text}`,
    workLabel && activity.kind !== 'remote' && workLabel,
    `Double-click or F2 to rename${closable ? ' · drag to reorder' : ''}`,
  ].filter(Boolean).join('\n');

  // What a screen reader hears for the row: its children are presentational.
  const ariaLabel = [
    name,
    activity.label,
    queuePos >= 0 && `waiting on you, ${queuePos === 0 ? 'next' : `number ${queuePos + 1}`}`,
    info?.branch && `branch ${info.branch}`,
    info?.branch && (info.files === 0 ? 'clean' : `${plural(info.files, 'file')} changed`),
    ...livePlans.map((p) => `plan ${p.title || 'untitled'}${p.autopilot?.status ? `, auto-pilot ${p.autopilot.status}` : ''}`),
    info?.worktrees?.length > 0 && plural(info.worktrees.length, 'other worktree'),
    linked && 'linked to the prompt',
    workLabel,
  ].filter(Boolean).join(', ');

  // Row actions sit on the branch line of an unfolded row, so they never
  // squeeze the name; a one-line row keeps them beside the readout.
  // `reserve` keeps their width while hidden, so hovering never rewraps the branch.
  const rowActions = (reserve) => (
    <span
      className={cn(
        'shrink-0 items-center gap-1.5',
        reserve ? 'flex' : roleMenuOpen ? 'flex' : 'hidden group-hover:flex group-focus-within:flex',
        reserve && !roleMenuOpen && 'invisible group-hover:visible group-focus-within:visible',
      )}
    >
      {!tab.role && <RoleTagButton tab={tab} open={roleMenuOpen} onOpenChange={onRoleMenu} />}

      {!active && !linked && (
        <RowAction
          tabIndex={-1}
          aria-pressed="false"
          aria-label={linkLabel}
          title="Link this repo into the current prompt (l)"
          onClick={() => actions.toggleLink(tab, name, linked)}
          className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-[var(--ins-lamp)]"
        >
          <Link size={12} />
        </RowAction>
      )}
      <RowAction
        tabIndex={-1}
        aria-label={`Open ${name} in the file manager`}
        title="Open folder in file manager (f)"
        onClick={() => actions.openFolder(tab.projectPath)}
        className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-[var(--ins-lamp)]"
      >
        <Folder size={12} />
      </RowAction>
      {closable && (
        <RowAction
          tabIndex={-1}
          aria-label={`Close ${name}`}
          title="Close tab (x)"
          onClick={() => actions.closeTab(tab.id)}
          className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-[var(--ins-fault)]"
        >
          ×
        </RowAction>
      )}
    </span>
  );

  return (
    // A div, not a <button>: it holds the rename input and other controls.
    <div
      role="option"
      aria-selected={active}
      aria-label={ariaLabel}
      aria-describedby="tab-row-keys"
      data-tab-row={tab.id}
      // One tab stop for the list: the active row. j/k move from there.
      tabIndex={active ? 0 : -1}
      draggable={closable && !renaming}
      onDragStart={(e) => drag.onDragStart(e, index)}
      onDragOver={(e) => drag.onDragOver(e, index)}
      onDrop={drag.onDrop}
      onDragEnd={drag.endDrag}
      onClick={() => actions.switchTab(tab.id)}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        if (e.button === 1 && closable) {
          e.preventDefault();
          actions.closeTab(tab.id);
        }
      }}
      title={tooltip}
      aria-keyshortcuts="Enter r x l t w a f o e"
      data-marker="top"
      className={cn(
        'group relative flex flex-col gap-1 pl-3 pr-2.5 text-left text-[11px] cursor-pointer edge-b-engraved focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]',
        compact ? 'py-1.5' : 'py-2.5',
        active ? 'ins-row-selected before:!top-3' : 'hover:bg-foreground/5',
        // Waiting on you: the row is framed in the lamp gold.
        queued ? 'outline-solid outline-1 -outline-offset-1 outline-[var(--ins-lamp)]' : 'outline-none',
        drag.dragIndex === index && 'opacity-50',
      )}
    >
      {/* Where the dragged tab will land: a lamp-lit hairline on the edge. */}
      {dropLine && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 z-10 h-px bg-[var(--ins-lamp)]',
            dropLine === 'after' ? 'bottom-0' : 'top-0',
          )}
        />
      )}
      {/* Tier 1: what it is and what it is doing. */}
      <div className="flex h-5 min-w-0 items-center gap-2">
        {/* Tab number, 16px wide so the tiers below line up at pl-6. Boxed only
            while it waits on you; otherwise a plain ordinal, not a keycap. */}
        <span
          aria-hidden="true"
          title={queued ? `Waiting on you · ${queuePos === 0 ? 'next' : `#${queuePos + 1}`} for Alt+A` : index < 9 ? `Ctrl+${index + 1}` : undefined}
          className={cn(
            'inline-flex h-4 w-4 shrink-0 items-center justify-center border font-mono text-[11px] tabular-nums',
            queued ? 'border-[var(--ins-lamp)] text-[var(--ins-lamp)]' : 'border-transparent text-muted-foreground',
          )}
        >
          {index + 1}
        </span>
        {renaming ? (
          <RenameField
            initial={name}
            onCommit={(value) => actions.commitRename(tab, value)}
            onCancel={actions.cancelRename}
          />
        ) : (
          <span
            className="flex min-w-0"
            onDoubleClick={(e) => {
              e.stopPropagation();
              actions.startRename(tab.id);
            }}
          >
            <MiddleTruncate
              text={name}
              className={cn(
                'ins-name text-[15px] font-semibold! leading-5',
                active ? 'text-foreground' : compact ? 'text-muted-foreground' : 'text-foreground/80',
              )}
            />
          </span>
        )}
        {tab.role && <RoleChip tab={tab} open={roleMenuOpen} onOpenChange={onRoleMenu} />}
        {linked && (
          <RowAction
            tabIndex={-1}
            aria-pressed="true"
            aria-label={linkLabel}
            title="Linked to the current prompt — click to unlink (l)"
            onClick={() => actions.toggleLink(tab, name, linked)}
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ins-lamp)] hover:text-[var(--ins-fault)]"
          >
            <Link size={12} />
          </RowAction>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {compact && rowActions(false)}
          <WorktreeMenu tab={tab} worktrees={info?.worktrees} open={worktreeMenuOpen} onOpenChange={onWorktreeMenu} onReview={actions.reviewWorktree} onMerge={actions.mergeWorktree} onDelete={actions.deleteWorktree} />
          <Readout
            info={info}
            contextFill={contextFill}
            autoCommit={autoCommit}
            lamp={activityLamp(activity.kind, queued)}
            label={activity.label}
            // A folded row's actions take the readout's place on hover, so the name keeps its width.
            className={compact && (roleMenuOpen ? 'hidden' : 'group-hover:hidden group-focus-within:hidden')}
          />
        </span>
      </div>

      {!compact && (
        <>
          {/* Tier 2: the branch, truncated; the full name is in the tooltip. */}
          <div className="flex min-w-0 pl-6 text-[11px] text-muted-foreground">
            {info?.branch ? (
              <RowAction
                tabIndex={-1}
                onClick={() => actions.copyBranch(info.branch)}
                title={`${info.branch}\nClick to copy`}
                className="flex min-w-0 items-center gap-1 font-mono hover:text-[var(--ins-lamp)]"
              >
                <Branch size={12} className="shrink-0" />
                <span className="min-w-0 truncate">{info.branch}</span>
              </RowAction>
            ) : (
              <span>no repo</span>
            )}
            <span className="ml-auto pl-2">{rowActions(true)}</span>
          </div>

          {/* Tier 3: one status line, always there so the row keeps its height.
              Click the turn for the files it edited. */}
          {permission ? (
            <div className="flex h-4 min-w-0 items-baseline gap-1 pl-6 text-[11px] leading-4 text-muted-foreground">
              <span className="ins-name min-w-0 truncate text-xs text-foreground">{activityQuestion ?? activity.label}</span>
              {activity.since && <span className="shrink-0 tabular-nums text-[var(--ins-lamp)]">· {activity.since}</span>}
            </div>
          ) : showTrail ? (
            <TurnTrail
              turn={turn}
              summary={summary}
              root={root}
              open={trailOpen}
              onToggle={() => actions.toggleTrail(tab.id)}
              onAttach={actions.attachEdits}
            />
          ) : workLabel ? (
            <div className="flex h-4 min-w-0 items-center gap-1 pl-6 text-[11px] leading-4 text-[var(--ins-lamp)]">
              <Agent size={12} className="shrink-0" />
              <span className="min-w-0 truncate">{workLabel}</span>
            </div>
          ) : (
            <div className="h-4 pl-6 text-[11px] leading-4 text-muted-foreground">no turn yet</div>
          )}

          {/* Tier 4: the plan its agent is working through, or the last one it finished. */}
          {cardPlans.map((plan) => (
            <TabPlanTier
              key={plan.id}
              plan={plan}
              note={livePlans.length ? undefined : settledNote}
              onOpen={() => actions.openPlan(tab.id, plan.id)}
              onResume={() => actions.resumePlan(plan)}
              onStop={() => actions.stopPlan(plan)}
              onShelve={() => actions.shelvePlan(plan)}
              onMerge={() => actions.mergePlan(tab.id, plan)}
              terminalShown={!!plan.tabId && tab.showing === plan.tabId}
              onTerminal={plan.tabId ? () => actions.togglePlanTerminal(tab.id, plan) : null}
            />
          ))}
        </>
      )}
    </div>
  );
});
