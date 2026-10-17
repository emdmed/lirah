import { cn } from '../../lib/utils';
import { Lamp } from '../../components/instrument/Lamp';
import { DiffBar } from '../../components/instrument/DiffBar';
import { useBookmarks } from '../bookmarks';
import { useToast } from '../toast';
import { useTabManager } from './TabContext';
import { useTabsSummary } from './useTabsSummary';
import { getLastOutputAt, getTabSession } from './terminalActivity';

// Output within this window counts as the terminal currently working.
const ACTIVE_MS = 2500;

function formatAgo(ms) {
  const secs = Math.max(0, Math.floor(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// A running CLI that has gone quiet is waiting on you; a plain shell that has
// gone quiet is idle.
function tabActivity(tabId, cliName, now) {
  const out = getLastOutputAt(getTabSession(tabId));
  const quiet = out ? now - out : Infinity;
  const since = out ? formatAgo(quiet) : null;
  if (cliName) {
    return quiet < ACTIVE_MS
      ? { label: `${cliName} working`, lamp: { state: 'on', blink: true } }
      : { label: `${cliName} waiting`, since, lamp: { state: 'warn' } };
  }
  return quiet < ACTIVE_MS
    ? { label: 'running', lamp: { state: 'on' } }
    : { label: 'idle', since, lamp: { state: 'off' } };
}

export function TabsSummaryPane() {
  const { tabs, activeTabId, switchTab, removeTab } = useTabManager();
  const closable = tabs.length > 1;
  const { repo, cli, now } = useTabsSummary(tabs);
  const { bookmarks } = useBookmarks();
  const toast = useToast();

  const copyBranch = async (e, branch) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(branch);
      toast.success(`Copied ${branch}`);
    } catch {
      toast.error('Could not copy branch name');
    }
  };

  return (
    <div className="flex flex-col">
      {tabs.map((tab) => {
        const info = repo[tab.id];
        const activity = tabActivity(tab.id, cli[tab.id], now);
        const active = tab.id === activeTabId;
        const name =
          bookmarks.find((b) => b.path === tab.projectPath)?.name ?? tab.label;
        return (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            onMouseDown={(e) => {
              if (e.button === 1 && closable) {
                e.preventDefault();
                removeTab(tab.id);
              }
            }}
            title={`${tab.projectPath}\n${activity.label}${activity.since ? ` · ${activity.since}` : ''}`}
            aria-current={active ? 'page' : undefined}
            data-marker="top"
            className={cn(
              'group flex flex-col gap-1 px-2.5 py-2 text-left text-[11px] cursor-pointer edge-b-engraved',
              active ? 'ins-row-selected' : 'hover:bg-foreground/5',
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Lamp {...activity.lamp} label={activity.label} />
              <span
                className={cn(
                  'min-w-0 truncate font-medium text-xs',
                  active ? 'text-[var(--ins-lamp)]' : 'text-foreground',
                )}
              >
                {name}
              </span>
              {closable && (
                <span
                  role="button"
                  aria-label={`Close ${name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tab.id);
                  }}
                  className={cn(
                    'ml-auto inline-flex items-center justify-center w-4 h-4 shrink-0 text-muted-foreground hover:text-[var(--ins-fault)]',
                    active
                      ? 'opacity-60 group-hover:opacity-100'
                      : 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  ×
                </span>
              )}
            </div>
            <div className="flex pl-[13px] min-w-0">
              {info?.branch ? (
                <span
                  role="button"
                  onClick={(e) => copyBranch(e, info.branch)}
                  title="Copy branch name"
                  className="min-w-0 truncate font-mono text-muted-foreground hover:text-[var(--ins-lamp)]"
                >
                  {info.branch}
                </span>
              ) : (
                <span className="text-muted-foreground">no repo</span>
              )}
            </div>
            {info?.branch && (
              <div className="flex items-center gap-1.5 pl-[13px] min-w-0 whitespace-nowrap text-muted-foreground">
                {info.files === 0 ? (
                  <span>clean</span>
                ) : (
                  <>
                    <span className="font-mono tabular-nums">
                      <span className="text-git-added">+{info.added}</span>{' '}
                      <span className="text-git-deleted">−{info.deleted}</span>
                    </span>
                    <DiffBar
                      added={info.added}
                      removed={info.deleted}
                      width={28}
                    />
                    <span className="ml-auto tabular-nums">
                      {info.files} file{info.files === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
