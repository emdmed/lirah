import { cn } from '../../lib/utils';
import { Lamp } from '../../components/instrument/Lamp';
import { DiffBar } from '../../components/instrument/DiffBar';
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
  const { tabs, activeTabId, switchTab } = useTabManager();
  const { repo, cli, now } = useTabsSummary(tabs);

  return (
    <div className="flex flex-col">
      {tabs.map((tab) => {
        const info = repo[tab.id];
        const activity = tabActivity(tab.id, cli[tab.id], now);
        const active = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            title={`${tab.projectPath}\n${activity.label}${activity.since ? ` · ${activity.since}` : ''}`}
            className={cn(
              'flex flex-col gap-1 px-2.5 py-2 text-left text-[11px] cursor-pointer edge-b-engraved',
              active ? 'ins-row-selected' : 'hover:bg-foreground/5'
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Lamp {...activity.lamp} label={activity.label} />
              <span className={cn('min-w-0 truncate font-medium', active ? 'text-[var(--ins-lamp)]' : 'text-foreground')}>
                {tab.label}
              </span>
              {info?.branch && (
                <span className="ml-auto min-w-0 shrink-[3] truncate font-mono text-muted-foreground">
                  {info.branch}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 pl-[18px] min-w-0 whitespace-nowrap text-muted-foreground">
              {!info?.branch ? (
                <span>no repo</span>
              ) : info.files === 0 ? (
                <span>clean</span>
              ) : (
                <>
                  <span className="font-mono tabular-nums">
                    <span className="text-git-added">+{info.added}</span>{' '}
                    <span className="text-git-deleted">−{info.deleted}</span>
                  </span>
                  <DiffBar added={info.added} removed={info.deleted} width={28} />
                  <span className="ml-auto tabular-nums">
                    {info.files} file{info.files === 1 ? '' : 's'}
                  </span>
                </>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
