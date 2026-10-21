import { Bot, GitBranch, Link2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { plural } from '../../lib/plural';
import { MiddleTruncate } from '../../components/MiddleTruncate';
import { ACTIVITY } from './tabActivity';
import { RowAction } from './RowAction';
import { RenameField } from './RenameField';
import { RoleChip, RoleTagButton } from './RoleMenu';
import { TurnTrail } from './TurnTrail';

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

/**
 * One tab in the tabs summary pane: what it is doing, its branch, its agent's
 * latest turn and another agent working in its repo. `drag` is useDragReorder's
 * result; `actions` the pane's handlers.
 */
export function TabRow({
  tab, index, name, info, activity, workLabel, active, linked, closable, queuePos, turn, summary, trailOpen, renaming,
  drag, actions,
}) {
  const root = tab.projectPath.replace(/\/+$/, '');
  const linkLabel = linked ? `Unlink ${name} from the current prompt` : `Link ${name} into the current prompt`;
  const dropLine = drag.dropLineAt(index);
  return (
    // A div, not a <button>: it holds the rename input and other controls.
    <div
      role="button"
      tabIndex={0}
      draggable={closable && !renaming}
      onDragStart={(e) => drag.onDragStart(e, index)}
      onDragOver={(e) => drag.onDragOver(e, index)}
      onDrop={drag.onDrop}
      onDragEnd={drag.endDrag}
      onClick={() => actions.switchTab(tab.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          actions.switchTab(tab.id);
        } else if (e.key === 'F2') {
          e.preventDefault();
          actions.startRename(tab.id);
        }
      }}
      onMouseDown={(e) => {
        if (e.button === 1 && closable) {
          e.preventDefault();
          actions.closeTab(tab.id);
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
              className={cn('text-xs', active ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}
            />
          </span>
        )}
        {tab.role && <RoleChip tab={tab} />}
        {linked && (
          <RowAction
            aria-pressed="true"
            aria-label={linkLabel}
            title="Linked to the current prompt — click to unlink"
            onClick={() => actions.toggleLink(tab, name, linked)}
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ins-lamp)] hover:text-[var(--ins-fault)]"
          >
            <Link2 className="h-3 w-3" />
          </RowAction>
        )}

        {info?.branch && (
          <span className="ml-auto shrink-0 whitespace-nowrap font-mono tabular-nums text-muted-foreground group-hover:hidden group-has-[[data-state=open]]:hidden">
            {info.files === 0 ? (
              'clean'
            ) : (
              <span title={`${plural(info.files, 'file')} changed`}>
                <span className="text-git-added">+{info.added}</span>{' '}
                <span className="text-git-deleted">−{info.deleted}</span>
              </span>
            )}
          </span>
        )}
        <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex group-has-[[data-state=open]]:flex">
          {!tab.role && <RoleTagButton tab={tab} />}
          {!active && !linked && (
            <RowAction
              aria-pressed="false"
              aria-label={linkLabel}
              title="Link this repo into the current prompt"
              onClick={() => actions.toggleLink(tab, name, linked)}
              className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-[var(--ins-lamp)]"
            >
              <Link2 className="h-3 w-3" />
            </RowAction>
          )}
          {closable && (
            <RowAction
              aria-label={`Close ${name}`}
              title="Close tab"
              onClick={() => actions.closeTab(tab.id)}
              className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-[var(--ins-fault)]"
            >
              ×
            </RowAction>
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
          <RowAction
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

      {/* Tier 3: what its agent did in the latest turn; click for the files. */}
      {summary && (
        <TurnTrail
          turn={turn}
          summary={summary}
          root={root}
          open={trailOpen}
          onToggle={() => actions.toggleTrail(tab.id)}
          onAttach={actions.attachEdits}
        />
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
}
