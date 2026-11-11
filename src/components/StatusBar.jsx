import { useMemo, memo } from 'react';
import { Agent, ChevronDown, Clear, Collapse, Command, Commit, FindInFile, Merge, Settings, Stats, Terminal } from '@/components/icons';
import { Scanner } from './instrument/Scanner';
import { Button } from './ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuShortcut,
  DropdownMenuLabel, DropdownMenuGroup, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from './ui/dropdown-menu';
import { CLI_OPTIONS } from '../features/cli-selection/CliSelectionModal';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/lib/utils';
import { useTokenBudget } from '../features/token-budget/TokenBudgetContext';
import { useTokenUsageValue } from '../features/token-budget/tokenUsageStore';
import { getContextFill, HEAVY_CONTEXT_TOKENS } from '../config/models';
import { Lamp } from './instrument/Lamp';
import { LirahMark } from './LirahMark';
import { WindowControls } from './WindowControls';
import { IS_MAC, IS_WINDOWS, basename } from '../utils/pathUtils';
import { Meter } from './instrument/Meter';
import { ToggleSwitch } from './instrument/ToggleSwitch';
import { useConfirm } from '../features/dialogs/DialogProvider';
import { shortcutForCommand } from '../lib/shortcuts';
import { ContextPeek } from '../features/token-budget/ContextPeek';
import { Fig06Context } from './Fig06Context';
import { Fig10Sandbox } from '../features/settings/Fig10Sandbox';
import { useFigureCompact } from './instrument/figure';

const CLI_DISPLAY = {
  'claude-code': { name: 'claude', icon: Agent },
  'opencode': { name: 'opencode', icon: Terminal }
};


function ChangelogStatus({ status }) {
  const config = useMemo(() => ({
    updating: { component: Scanner, text: 'Updating changelog...', props: {} },
    done: { lamp: 'ok', text: 'Changelog updated' },
    error: { lamp: 'fault', text: 'Changelog failed' }
  }), []);

  const { component: Component, lamp, text, props } = config[status] || {};
  if (!Component && !lamp) return null;

  return (
    <span className="flex items-center gap-1.5 px-1.5 text-xs opacity-80">
      {Component ? <Component {...props} /> : <Lamp state={lamp} />}
      <span>{text}</span>
    </span>
  );
}

// Hover shows FIG.10 while the sandbox is on and running; the one-word state
// is its fallback.
function SandboxSwitch({ enabled, failed, onToggle, projectPath, networkIsolation }) {
  const tooltip = IS_WINDOWS ? 'not available on Windows'
    : enabled && failed ? 'failed' : enabled ? 'on' : 'off';
  const compact = useFigureCompact();
  const drawn = enabled && !failed && !IS_WINDOWS;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 px-1">
          {/* The site's sandbox orbit: a dashed ring, faint while off. */}
          <svg width="14" height="14" viewBox="-8 -8 16 16" aria-hidden="true" className={cn('shrink-0', !enabled && 'text-faint')}>
            <circle r="6.2" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.6" />
          </svg>
          <span>sandbox</span>
          <ToggleSwitch checked={enabled} onChange={onToggle} disabled={IS_WINDOWS} label="Sandbox" tone="ink" />
          {enabled && failed && <Lamp state="fault" label="Sandbox failed" />}
        </span>
      </TooltipTrigger>
      {drawn ? (
        <TooltipContent side="top" className={cn('px-0 py-0 text-left text-wrap', compact ? 'w-[332px] max-w-[332px]' : 'w-[492px] max-w-[492px]')}>
          <Fig10Sandbox
            projectPath={projectPath}
            networkIsolation={networkIsolation}
            paper="var(--ins-raised)"
            className="px-4 pt-2 pb-3"
            fallback={<div className="px-2 py-1">Sandbox · {tooltip}</div>}
          />
        </TooltipContent>
      ) : <TooltipContent title="Sandbox" hint="click to change">{tooltip}</TooltipContent>}
    </Tooltip>
  );
}

// The per-tab compaction hook: a fresh project index for the agent on each
// prompt. Shown here while the prompt box is closed (the box has its own).
function CompactionSwitch({ enabled, onToggle }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 px-1">
          <span>index</span>
          <ToggleSwitch checked={enabled} onChange={onToggle} label="Compaction hook" tone="ink" />
        </span>
      </TooltipTrigger>
      <TooltipContent title="Index" hint="Ctrl+Shift+P">
        {enabled ? 'on' : 'off'} · this tab's agent gets a fresh project index to grep on each prompt
      </TooltipContent>
    </Tooltip>
  );
}

function NetworkSwitch({ isolated, enabled, onToggle }) {
  const tooltip = IS_WINDOWS ? 'isolation not available on Windows'
    : isolated && enabled ? 'isolated' : 'allowed';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 px-1">
          <span>net</span>
          <ToggleSwitch checked={isolated} onChange={onToggle} disabled={IS_WINDOWS || !enabled} label="Network isolation" tone="warn" />
        </span>
      </TooltipTrigger>
      <TooltipContent title="Network" hint="click to change">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// Token gauge, centred in the top row: context-window fill (or, before context
// data arrives, the daily budget) with used / max and %. Past
// HEAVY_CONTEXT_TOKENS the fill and readout go amber. Hover shows what fills
// the context; click opens the actions (compact, clear, Details, metrics).
// Every slot has a fixed width and an idle placeholder so the gauge never
// shifts between tabs.
// Reads usage from the tab's store itself, so a usage poll re-renders only
// the gauge, not the status bar.
function ContextMeter({ currentPath, onOpenDashboard, onOpenContextDetails, onClearContext, onCompactContext }) {
  const { getBudget, currentUsage, formatTokenCount, tokenUsageStore } = useTokenBudget();
  const tokenUsage = useTokenUsageValue(tokenUsageStore);
  const ctx = getContextFill(tokenUsage);
  const dailyLimit = getBudget(currentPath)?.dailyLimit;
  const fmt = (n) => (formatTokenCount ? formatTokenCount(n) : String(n));

  let legend = 'Ctx', value = 0, max = 0;
  if (ctx) {
    value = ctx.used; max = ctx.max;
  } else if (dailyLimit) {
    legend = 'Budget'; value = currentUsage.total; max = dailyLimit;
  }
  const pct = max ? Math.round((value / max) * 100) : null;
  const heavy = !!ctx && ctx.used > HEAVY_CONTEXT_TOKENS;
  // Worth acting on: near the warn zone, or heavy whatever the window size.
  const crowded = heavy || pct >= 80;
  // Mirrors Meter's thresholds: the readout only lights once it means something.
  const tone = pct >= 95 ? 'tube tube-overflow' : pct >= 80 || heavy ? 'text-[var(--ins-warn)]' : 'text-foreground';

  return (
    <DropdownMenu>
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label="Context usage"
          className="flex items-center gap-2 px-1 focus-ring cursor-pointer"
        >
          <span className="ins-legend shrink-0">{legend}</span>
          <Meter
            value={value}
            max={max || 1}
            size="lg"
            printed={false}
            readout={false}
            caution={heavy}
            label={legend === 'Ctx' ? 'Context window' : 'Daily budget'}
            className={max ? undefined : 'opacity-40'}
          />
          {/* One figure: the fill already reads as a share; % is in the hover card. */}
          <span className={cn('flex items-baseline tabular-nums', pct == null ? 'tube-idle' : tone)}>
            <span className="w-[6ch] text-right">{max ? fmt(value) : '--'}</span>
            {/* The ceiling recedes so the live value leads. */}
            <span className="px-0.5 text-faint">/</span>
            <span className="w-[5ch] text-faint">{max ? fmt(max) : '--'}</span>
          </span>
        </span>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      {/* Hover: what fills the context. Mounts only while shown. */}
      <TooltipContent side="bottom" className="w-[416px] max-w-[416px] px-0 py-0 text-left text-wrap">
        {/* Figures: full draws FIG.06; the one-line header is its fallback and
            what sessions without last-turn parts show. */}
        <Fig06Context
          tokenUsage={tokenUsage}
          className="px-2 pt-1.5 pb-2"
          fallback={(
            <div className="flex items-baseline justify-between gap-2 px-2 py-1.5 text-[11px]">
              <span className="ins-legend">Context · this tab</span>
              {ctx ? (
                <span className="tabular-nums">
                  <span className={tone}>{fmt(ctx.used)}</span>
                  <span className="text-faint"> / {fmt(ctx.max)} · </span>
                  <span className={tone}>{pct}%</span>
                </span>
              ) : dailyLimit ? (
                <span className="tabular-nums">budget {fmt(currentUsage.total)} / {fmt(dailyLimit)}</span>
              ) : null}
            </div>
          )}
        />
        <ContextPeek tokenUsage={tokenUsage} projectPath={currentPath} heavy={crowded} />
      </TooltipContent>
    </Tooltip>
      {/* Click: actions on the context. */}
      <DropdownMenuContent side="bottom" align="center" className="w-64 text-xs">
        {crowded && onCompactContext && (
          <DropdownMenuItem onClick={onCompactContext} className="cursor-pointer py-1">
            <Collapse size={12} className="mr-2" />
            Compact (summarise and continue)
          </DropdownMenuItem>
        )}
        {onOpenContextDetails && (
          <DropdownMenuItem onClick={onOpenContextDetails} className="cursor-pointer py-1">
            <FindInFile size={12} className="mr-2" />
            Details…
          </DropdownMenuItem>
        )}
        {onOpenDashboard && (
          <DropdownMenuItem onClick={onOpenDashboard} className="cursor-pointer py-1">
            <Stats size={12} className="mr-2" />
            Token Metrics
            <DropdownMenuShortcut keys={shortcutForCommand('tokens')} />
          </DropdownMenuItem>
        )}
        {/* Destructive last, below a rule. */}
        {crowded && onClearContext && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={onClearContext} className="cursor-pointer py-1">
              <Clear size={12} className="mr-2" />
              Clear context
              <DropdownMenuShortcut keys={shortcutForCommand('clear')} />
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Memoized: StatusBar's props are all primitives/callbacks, so with stable
// callbacks (see ProjectTab call site) it skips re-render on every keystroke
// in the prompt textarea and on the 5s token/branch polls.
// Status-bar chip for a finished auto commit whose dialog was hidden (the
// tab row shows the run itself).
const AUTO_COMMIT_CHIP = {
  ready: { label: 'ready', lamp: 'ok' },
  error: { label: 'failed', lamp: 'fault' },
};

export const StatusBar = memo(({
  viewMode, currentPath, sessionId, onToggleHelp,
  selectedCli, onCliChange, cliAvailability = {}, showTitleBar,
  sandboxEnabled, sandboxFailed, networkIsolation,
  onToggleNetworkIsolation, onToggleSandbox, secondaryTerminalFocused,
  onOpenDashboard, onOpenContextDetails, changelogStatus, onOpenSettings, onAutoCommit, onAutoMerge,
  autoCommitStage = 'idle', onShowAutoCommit,
  onClearContext, onCompactContext,
  availableUpdate, compactionEnabled = false, onToggleCompaction, branchName,
}) => {
  const confirm = useConfirm();

  // File watching has no shortcut (Ctrl+W closes the tab): it's in Settings
  // and the `:watch` command. Ctrl+Shift+L lives in useTabShortcuts,
  // where only the active tab listens.

  const cliName = CLI_DISPLAY[selectedCli]?.name || selectedCli;

  // Both switches restart the terminal, so a live session asks first.
  const handleSandboxToggle = async () => {
    if (sessionId && !(await confirm({
      title: sandboxEnabled ? 'Turn sandbox off' : 'Turn sandbox on',
      description: 'Anything running in this terminal ends.',
      facts: [
        { label: 'Terminal', value: `${cliName} restarts` },
        { label: 'Isolation', value: sandboxEnabled ? 'file system sandboxed → open' : 'file system open → sandboxed' },
      ],
      confirmLabel: 'Restart',
    }))) return;
    onToggleSandbox();
  };

  const handleNetworkToggle = async () => {
    if (sessionId && !(await confirm({
      title: networkIsolation ? 'Restore network' : 'Block network',
      description: 'Anything running in this terminal ends.',
      facts: [
        { label: 'Terminal', value: `${cliName} restarts` },
        { label: 'Isolation', value: networkIsolation ? 'network blocked → open' : 'network open → blocked' },
      ],
      confirmLabel: 'Restart',
    }))) return;
    onToggleNetworkIsolation();
  };

  // The header drags the window only while the window controls are on, as the
  // old title bar did: with them off nothing in the window moves it.
  const drag = showTitleBar ? { 'data-tauri-drag-region': true } : {};

  return (
    <>
    <div
      className="ins-rail grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 pl-2 pr-2 h-full text-xs font-mono text-foreground"
      {...drag}
    >
      {/* LEFT: maker's mark, project name and branch, then waiting / update. On macOS the window controls come first, at the left. */}
      <div className="flex items-center gap-3 overflow-hidden min-w-0" {...drag}>
        {IS_MAC && showTitleBar && <WindowControls />}
        <LirahMark size={18} lit={!!sessionId} className="shrink-0 ml-1" />
        {currentPath && (
          <span className="flex items-baseline gap-2 min-w-0" title={currentPath}>
            <span className="ins-name text-[16px] leading-none shrink-0">{basename(currentPath)}</span>
            {branchName && <span className="text-muted-foreground truncate">{branchName}</span>}
          </span>
        )}

        <div className="ml-auto" />

        {/* Context actions: update (shown when relevant) */}
        {availableUpdate && (
          <>
            <div className="flex items-center gap-0.5">
              {availableUpdate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="panel"
                      onClick={() => {
                        import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
                          openUrl(availableUpdate.url);
                        });
                      }}
                    >
                      <Lamp state="ok" />
                      <span className="text-muted-foreground">update {availableUpdate.version}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent title="Update available" hint="click to view release">{availableUpdate.version}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}
      </div>

      {/* CENTRE: the context gauge, alone so it reads at a glance. The side
          columns share the remaining width equally, keeping it centred. */}
      <ContextMeter
        currentPath={currentPath}
        onOpenDashboard={onOpenDashboard}
        onOpenContextDetails={onOpenContextDetails}
        onClearContext={sessionId ? onClearContext : undefined}
        onCompactContext={sessionId ? onCompactContext : undefined}
      />

      {/* RIGHT: Runtime status + Settings */}
      <div className="flex items-center justify-end gap-4 min-w-0" {...drag}>
        {/* Transient status (changelog) — only visible when active */}
        {changelogStatus && (
          <ChangelogStatus status={changelogStatus} />
        )}

        {/* A hidden auto commit: its progress, and a way back to review it. */}
        {AUTO_COMMIT_CHIP[autoCommitStage] && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="panel" onClick={onShowAutoCommit} className="lowercase">
                <Lamp state={AUTO_COMMIT_CHIP[autoCommitStage].lamp} blink={AUTO_COMMIT_CHIP[autoCommitStage].blink} />
                commit · {AUTO_COMMIT_CHIP[autoCommitStage].label}
              </Button>
            </TooltipTrigger>
            <TooltipContent title="Auto commit" hint="click to open">{autoCommitStage === 'ready' ? 'ready to review and commit' : AUTO_COMMIT_CHIP[autoCommitStage].label}</TooltipContent>
          </Tooltip>
        )}

        {/* Runtime zone: CLI, sandbox, network. Jobs live
            in their own rail, so they are not repeated here. */}
        <div className="flex items-center gap-4">
          {selectedCli && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="panel" className="lowercase gap-2">
                      {cliName}
                      <ChevronDown size={12} className="text-faint" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent title="Agent" hint="Ctrl+K">{cliName} · click to change the CLI</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48 text-xs">
                <DropdownMenuRadioGroup value={selectedCli} onValueChange={onCliChange}>
                  {CLI_OPTIONS.map((o) => {
                    const installed = cliAvailability[o.id] ?? true;
                    return (
                      <DropdownMenuRadioItem key={o.id} value={o.id} disabled={!installed} className="cursor-pointer py-1">
                        {o.name}
                        {!installed && <span className="ml-auto text-faint">not installed</span>}
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {selectedCli && <span className="h-3.5 w-px shrink-0 bg-[var(--ins-edge)]" aria-hidden="true" />}
          {onToggleCompaction && (
            <CompactionSwitch enabled={compactionEnabled} onToggle={onToggleCompaction} />
          )}
          <SandboxSwitch
            enabled={sandboxEnabled}
            failed={sandboxFailed}
            onToggle={handleSandboxToggle}
            projectPath={currentPath}
            networkIsolation={networkIsolation}
          />
          {sandboxEnabled && (
            <NetworkSwitch isolated={networkIsolation} enabled={sandboxEnabled} onToggle={handleNetworkToggle} />
          )}
        </div>

        {/* Settings, the final anchor */}
        <span className="h-3.5 w-px shrink-0 bg-[var(--ins-edge)]" aria-hidden="true" />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="panel" aria-label="Settings and actions">
                  <span className="text-muted-foreground">settings</span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent title="Settings" hint="click for actions">preferences and quick actions</TooltipContent>
          </Tooltip>
          {/* Preferences live in the Settings dialog; this menu keeps actions. */}
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuItem onClick={onOpenSettings} className="cursor-pointer py-1">
              <Settings size={12} className="mr-2" />
              Settings…
            </DropdownMenuItem>
            <DropdownMenuSeparator star />
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenDashboard} className="cursor-pointer py-1">
                <Stats size={12} className="mr-2" />
                Token Metrics
                <DropdownMenuShortcut keys={shortcutForCommand('tokens')} />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAutoCommit} className="cursor-pointer py-1">
                <Commit size={12} className="mr-2" />
                Auto Commit…
                <DropdownMenuShortcut keys={shortcutForCommand('commit')} />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAutoMerge} className="cursor-pointer py-1">
                <Merge size={12} className="mr-2" />
                Auto Merge…
                <DropdownMenuShortcut keys={shortcutForCommand('merge')} />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleHelp} className="cursor-pointer py-1">
                <Command size={12} className="mr-2" />
                Keyboard Shortcuts
                <DropdownMenuShortcut keys={shortcutForCommand('help')} />
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {!IS_MAC && showTitleBar && (
          <>
            <span className="mx-1 h-3.5 w-px shrink-0 bg-[var(--ins-edge)]" aria-hidden="true" />
            <WindowControls />
          </>
        )}
      </div>
    </div>

  </>
  );
});

