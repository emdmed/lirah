import { memo } from 'react';
import { Folder, GitBranch, Link, Sparks } from 'iconoir-react';
import { cn } from '../../lib/utils';
import { plural } from '../../lib/plural';
import { MiddleTruncate } from '../../components/MiddleTruncate';
import { ContextMoon } from '../../components/instrument/ContextMoon';
import { DiffBar } from '../../components/instrument/DiffBar';
import { activityLamp, YOUR_TURN } from './tabActivity';
import { RowAction } from './RowAction';
import { rowKeys } from './rowKeys';
import { Scanner } from '../../components/instrument/Scanner';
import { Lamp } from '../../components/instrument/Lamp';
import { RenameField } from './RenameField';
import { RoleChip, RoleTagButton } from './RoleMenu';
import { TurnTrail } from './TurnTrail';
import { isSettledPlan, SettledPlans, TabPlanTier } from '../plans/TabPlanTier';

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
function Readout({ info, contextFill, autoCommit, lamp, label }) {
  let diff = null;
  if (autoCommit && autoCommit !== 'done') {
    diff = <AutoCommitMark stage={autoCommit} />;
  } else if (info?.branch) {
    diff = info.files === 0 ? (
      'clean'
    ) : (
      <span className="inline-flex" title={`${plural(info.files, 'file')} changed · +${info.added} −${info.deleted}`}>
        {info.added || info.deleted
          ? <DiffBar added={info.added} removed={info.deleted} side={24} fmt={compactCount} />
          : plural(info.files, 'file')}
      </span>
    );
  }
  // Fixed slots, so the moons line up down the pane whatever the counts are.
  return (
    <span className="flex shrink-0 items-center gap-2 whitespace-nowrap font-mono tabular-nums text-muted-foreground">
      <span className="min-w-[9ch] text-right">{diff}</span>
      <span className="inline-flex w-3 justify-center">
        {contextFill != null && <ContextMoon ratio={contextFill} />}
      </span>
      <Lamp {...lamp} label={label} />
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
  { keys: ['e'], label: 'edits' },
  { keys: ['t'], label: 'role' },
  { keys: ['r'], label: 'rename' },
  { keys: ['x'], label: 'close' },
];

/**
 * One tab in the tabs summary pane: what it is doing, its branch, its agent's
 * latest turn, the plans it is working through and another agent working in its
 * repo. `contextFill` (0..1, or null) is its agent's context window, drawn as a
 * moon. `compact` folds a tab with nothing live to its first line. `drag` is
 * useDragReorder's result; `actions` the pane's handlers.
 * Memoized: the pane re-renders on its 1s clock, so activity and the turn
 * summary come in as primitives and a row only redraws when what it shows
 * (a running "since" or duration included) changes.
 */
export const TabRow = memo(function TabRow({
  tab, index, name, info, contextFill, autoCommit, activityKind, activityLabel, activitySince, activityQuestion, agent, workLabel, active, linked, closable, queuePos,
  turn, summaryText, summaryRunning, summaryStale, trailOpen, renaming, roleMenuOpen, plans, compact, drag, actions,
}) {
  const activity = { kind: activityKind, label: activityLabel, since: activitySince };
  const summary = summaryText ? { text: summaryText, running: summaryRunning } : null;
  const root = tab.projectPath.replace(/\/+$/, '');
  const linkLabel = linked ? `Unlink ${name} from the current prompt` : `Link ${name} into the current prompt`;
  const dropLine = drag.dropLineAt(index);
  const livePlans = plans?.filter((p) => !isSettledPlan(p)) ?? [];
  // Finished plans only show while nothing is live, folded into one line.
  const settledPlans = livePlans.length ? [] : plans?.filter(isSettledPlan) ?? [];
  // An old finished turn leaves the row (it stays in the tooltip).
  const showTrail = summary && (!summaryStale || active || trailOpen);
  const yourTurn = YOUR_TURN.has(activity.kind);
  const queued = queuePos >= 0;
  // The ledger's second line: what the agent is doing, without its name twice.
  const doing = agent && activity.kind !== 'remote' && activity.label.startsWith(`${agent} `)
    ? activity.label.slice(agent.length + 1)
    : activity.label;
  const onRoleMenu = (open) => actions.setRoleMenu(open ? tab.id : null);
  const edited = turn?.edited?.size ? [...turn.edited] : null;

  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    const run = (fn) => {
      e.preventDefault();
      fn();
    };
    if (e.key === 'Enter' || e.key === ' ') return run(() => actions.switchTab(tab.id));
    const hit = rowKeys({ active, closable, edited, plans, summary }).find((k) => k.on.includes(e.key));
    if (!hit) return;
    run({
      attach: () => actions.attachEdits(edited),
      edits: () => actions.toggleTrail(tab.id),
      plan: () => actions.openPlan(tab.id, (livePlans[0] ?? plans[0]).id),
      link: () => actions.toggleLink(tab, name, linked),
      rename: () => actions.startRename(tab.id),
      close: () => actions.closeTab(tab.id),
      role: () => onRoleMenu(true),
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
    linked && 'linked to the prompt',
    workLabel,
  ].filter(Boolean).join(', ');

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
      aria-keyshortcuts="Enter r x l t a f o e"
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
        {/* Boxed tab number, 16px wide so the tiers below line up at pl-6. */}
        <span
          aria-hidden="true"
          title={queued ? `Waiting on you · ${queuePos === 0 ? 'next' : `#${queuePos + 1}`} for Alt+A` : undefined}
          className={cn(
            'inline-flex h-4 w-4 shrink-0 items-center justify-center border font-mono text-[10px] tabular-nums',
            queued ? 'border-[var(--ins-lamp)] text-[var(--ins-lamp)]' : 'border-[var(--ins-edge-strong)] text-muted-foreground',
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
                'ins-name text-[13px] leading-5',
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
            <Link className="h-3 w-3" />
          </RowAction>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {/* Row actions sit beside the readout, never over it: the diff is
              what you check before closing. */}
          <span
            className={cn(
              'shrink-0 items-center gap-1.5',
              roleMenuOpen ? 'flex' : 'hidden group-hover:flex group-focus-within:flex',
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
                <Link className="h-3 w-3" />
              </RowAction>
            )}
            <RowAction
              tabIndex={-1}
              aria-label={`Open ${name} in the file manager`}
              title="Open folder in file manager (f)"
              onClick={() => actions.openFolder(tab.projectPath)}
              className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-[var(--ins-lamp)]"
            >
              <Folder className="h-3 w-3" />
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
          <Readout
            info={info}
            contextFill={contextFill}
            autoCommit={autoCommit}
            lamp={activityLamp(activity.kind, queued)}
            label={activity.label}
          />
        </span>
      </div>

      {!compact && (
        <>
          {/* Tier 2: agent · activity; when it's your move, its question in
              italic and how long it has waited. */}
          <div className="flex min-w-0 items-baseline gap-1 pl-6 text-[11px] text-muted-foreground">
            {yourTurn ? (
              <>
                <span className="ins-name min-w-0 truncate text-xs text-foreground">{activityQuestion ?? doing}</span>
                {activity.since && <span className="shrink-0 tabular-nums text-[var(--ins-lamp)]">· {activity.since}</span>}
              </>
            ) : (
              <span className="min-w-0 truncate font-mono">{agent && activity.kind !== 'remote' ? `${agent} · ${doing}` : doing}</span>
            )}
          </div>

          {/* Tier 3: the branch, in full; long names wrap rather than clip. */}
          <div
            className={cn(
              'flex min-w-0 pl-6 text-[11px] text-muted-foreground',
              )}
          >
            {info?.branch ? (
              <RowAction
                tabIndex={-1}
                onClick={() => actions.copyBranch(info.branch)}
                title="Copy branch name"
                className="flex min-w-0 items-start gap-1 font-mono hover:text-[var(--ins-lamp)]"
              >
                <GitBranch className="mt-[2px] h-3 w-3 shrink-0" />
                <span className="min-w-0 break-all">{info.branch}</span>
              </RowAction>
            ) : (
              <span>no repo</span>
            )}
          </div>

          {/* Tier 4: what its agent did in the latest turn; click for the files. */}
          {showTrail && (
            <TurnTrail
              turn={turn}
              summary={summary}
              root={root}
              open={trailOpen}
              onToggle={() => actions.toggleTrail(tab.id)}
              onAttach={actions.attachEdits}
            />
          )}

          {/* Tier 5: the plans its agent is working through; click for the plan. */}
          {livePlans.map((plan) => (
            <TabPlanTier key={plan.id} plan={plan} onOpen={() => actions.openPlan(tab.id, plan.id)} />
          ))}
          <SettledPlans plans={settledPlans} onOpen={(planId) => actions.openPlan(tab.id, planId)} />

          {/* Tier 6: another tab's agent working in this repo, unless tier 2 says it. */}
          {workLabel && activity.kind !== 'remote' && (
            <div className="flex min-w-0 items-center gap-1 pl-6 text-[11px] text-[var(--ins-lamp)]">
              <Sparks className="h-3 w-3 shrink-0" />
              <span className="min-w-0 truncate">{workLabel}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
});
