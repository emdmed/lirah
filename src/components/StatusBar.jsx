import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Palette } from 'lucide-react';
import {
  Keyboard, Eye, EyeOff, Bot, Terminal,
  PanelTop, PanelTopClose, Coins, BarChart3, FileText, FileX, Check, AlertCircle,
  Layers, X, Monitor
} from 'lucide-react';
import { RetroSpinner } from './ui/RetroSpinner';
import { useWatcher } from '../features/watcher';
import { useWatcherShortcut } from '../features/watcher';
import { Button } from './ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuShortcut,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  DropdownMenuLabel, DropdownMenuGroup,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/lib/utils';
import { getScrollback, setScrollback, SCROLLBACK_OPTIONS, SCROLLBACK_WARN_THRESHOLD, subscribeTerminalPrefs } from '../lib/terminalPrefs';
import { useTokenBudget } from '../features/token-budget/TokenBudgetContext';
import { getContextFill } from '../config/models';
import { Lamp } from './instrument/Lamp';
import { Meter } from './instrument/Meter';
import { ToggleSwitch } from './instrument/ToggleSwitch';
import { useToast } from '../features/toast';

const CLI_DISPLAY = {
  'claude-code': { name: 'claude', icon: Bot },
  'opencode': { name: 'opencode', icon: Terminal }
};

const STATUS_COLORS = {
  critical: 'var(--color-status-critical, #E82424)',
  warning: 'var(--color-status-warning, #FF9E3B)',
  success: 'var(--color-status-success, #76946A)'
};

function CliIcon({ cli }) {
  const Icon = CLI_DISPLAY[cli]?.icon || Terminal;
  return <Icon className="w-3 h-3" />;
}


function ChangelogStatus({ status }) {
  const config = useMemo(() => ({
    updating: { component: RetroSpinner, text: 'Updating changelog...', props: { size: 12, lineWidth: 1.5 } },
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

function SandboxSwitch({ enabled, failed, onToggle }) {
  const tooltip = enabled && failed ? 'Sandbox: FAILED' : enabled ? 'Sandbox: ON' : 'Sandbox: OFF';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 px-1">
          <span className="ins-legend">Sandbox</span>
          <ToggleSwitch checked={enabled} onChange={onToggle} label="Sandbox" tone="ok" />
          {enabled && failed && <Lamp state="fault" label="Sandbox failed" />}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function NetworkSwitch({ isolated, enabled, onToggle }) {
  const tooltip = isolated && enabled ? 'Network: ISOLATED' : 'Network: ALLOWED';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 px-1">
          <span className="ins-legend">Net</span>
          <ToggleSwitch checked={isolated} onChange={onToggle} disabled={!enabled} label="Network isolation" tone="warn" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// Token gauge: context-window fill (or, before context data arrives, the
// daily budget) plus the session's billable count. Hidden when neither a
// ceiling nor billable usage is known.
function ContextMeter({ tokenUsage, currentPath }) {
  const { getBudget, currentUsage, formatTokenCount } = useTokenBudget();
  const ctx = getContextFill(tokenUsage);
  const dailyLimit = getBudget(currentPath)?.dailyLimit;
  const fmt = (n) => (formatTokenCount ? formatTokenCount(n) : String(n));

  const billableIn = tokenUsage?.billable_input_tokens || 0;
  const billableOut = tokenUsage?.billable_output_tokens || 0;
  const billable = billableIn + billableOut;

  let legend, value, max;
  if (ctx) {
    legend = 'Ctx'; value = ctx.used; max = ctx.max;
  } else if (dailyLimit) {
    legend = 'Budget'; value = currentUsage.total; max = dailyLimit;
  } else if (!billable) {
    return null;
  }
  const pct = max ? Math.round((value / max) * 100) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-3 px-1 cursor-default">
          {legend && (
            <span className="flex items-center gap-2">
              <span className="ins-legend">{legend}</span>
              <Meter value={value} max={max} size="lg" label={legend === 'Ctx' ? 'Context window' : 'Daily budget'} />
              <span className="tube tabular-nums">{pct}%</span>
            </span>
          )}
          {billable > 0 && (
            <span className="flex items-baseline gap-1.5">
              <span className="tabular-nums">{fmt(billable)}</span>
              <span className="engraved-label">billable</span>
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="flex flex-col font-mono">
          {ctx && <span>context {fmt(ctx.used)} / {fmt(ctx.max)} ({pct}%)</span>}
          {billable > 0 && <span>billable {billable.toLocaleString()} (in {billableIn.toLocaleString()} · out {billableOut.toLocaleString()})</span>}
          {tokenUsage?.cache_read_input_tokens ? <span>cache read {tokenUsage.cache_read_input_tokens.toLocaleString()} (free)</span> : null}
          {dailyLimit ? <span>daily budget {fmt(currentUsage.total)} / {fmt(dailyLimit)}</span> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}


// Always shown so the row doesn't reflow between repos and plain dirs.
// Click copies the branch name (without the dirty marker).
function BranchBadge({ branchName }) {
  const toast = useToast();
  const branch = branchName ? branchName.replace(/\*$/, '') : null;
  const dirty = !!branchName?.endsWith('*');

  const handleCopy = useCallback(async () => {
    if (!branch) return;
    try {
      await navigator.clipboard.writeText(branch);
      toast.success(`Copied ${branch}`);
    } catch {
      toast.error('Could not copy branch name');
    }
  }, [branch, toast]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          onClick={handleCopy}
          disabled={!branch}
          className="gap-1 px-1.5 h-5 shrink-0 max-w-[220px] before:content-none after:content-none"
        >
          <span className="text-muted-foreground">±</span>
          <span className={cn('truncate', branch ? 'text-foreground' : 'text-muted-foreground')}>
            {branch || 'no git'}
          </span>
          {dirty && <span className="text-[var(--ins-warn)]">*</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{branch ? `${branch}${dirty ? ' (uncommitted changes)' : ''} — click to copy` : 'Not a git repository'}</TooltipContent>
    </Tooltip>
  );
}

function ConfirmToggleDialog({ open, onOpenChange, title, description, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] border-destructive/30 edge-engraved bg-destructive/5">
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-base font-semibold">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-end gap-2 sm:justify-end mt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="edge-engraved">
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThemeSwitcherMenuItem() {
  const { currentTheme, themes, changeTheme } = useTheme();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer py-1 text-xs">
        <Palette className="mr-2 w-3 h-3" />
        Theme: {themes[currentTheme]?.name || 'Theme'}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="text-xs">
        {Object.entries(themes).map(([key, t]) => (
          <DropdownMenuItem key={key} onClick={() => changeTheme(key)} className="cursor-pointer py-1">
            {t.name}
            {currentTheme === key && <Check className="ml-auto w-3 h-3" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

// Memoized: StatusBar's props are all primitives/callbacks, so with stable
// callbacks (see ProjectTab call site) it skips re-render on every keystroke
// in the prompt textarea and on the 5s token/branch polls.
export const StatusBar = memo(({
  viewMode, currentPath, sessionId, onToggleHelp,
  selectedCli, onOpenCliSettings, showTitleBar,
  autoLaunchCli, onToggleAutoLaunchCli,
  onToggleTitleBar, sandboxEnabled, sandboxFailed, networkIsolation,
  onToggleNetworkIsolation, onToggleSandbox, secondaryTerminalFocused,
  onOpenBudgetSettings, onOpenDashboard, autoChangelogEnabled, changelogStatus,
  onOpenAutoChangelogDialog, autoCommitCli, onOpenAutoCommitConfig, branchName,
  onToggleBranchTasks, branchTasksOpen,
  workspace, onOpenWorkspaceDialog, onCloseWorkspace, onClearContext,
  availableUpdate, instrumentGlass, onToggleInstrumentGlass, tokenUsage
}) => {
  const { fileWatchingEnabled, toggleWatchers } = useWatcher();
  const [showSandboxConfirm, setShowSandboxConfirm] = useState(false);
  const [showNetworkConfirm, setShowNetworkConfirm] = useState(false);

  useWatcherShortcut({ onToggle: toggleWatchers, secondaryTerminalFocused });

  // Ctrl+Shift+L: Clear CLI context
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (secondaryTerminalFocused) return;
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        e.stopPropagation();
        if (onClearContext) onClearContext();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [secondaryTerminalFocused, onClearContext]);

  const cliName = CLI_DISPLAY[selectedCli]?.name || selectedCli;

  const handleSandboxToggle = () => {
    if (sessionId) {
      setShowSandboxConfirm(true);
    } else {
      onToggleSandbox();
    }
  };

  const confirmSandboxToggle = () => {
    setShowSandboxConfirm(false);
    onToggleSandbox();
  };

  const handleNetworkToggle = () => {
    if (sessionId) {
      setShowNetworkConfirm(true);
    } else {
      onToggleNetworkIsolation();
    }
  };

  const confirmNetworkToggle = () => {
    setShowNetworkConfirm(false);
    onToggleNetworkIsolation();
  };

  return (
    <>
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 pl-2 pr-2 h-full text-xs font-mono text-foreground"
    >
      {/* LEFT: branch + workspace + context. The tab itself names the project. */}
      <div className="flex items-center gap-1 overflow-hidden min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <BranchBadge branchName={branchName} />
          {workspace && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="xs" onClick={onOpenWorkspaceDialog} className="gap-1.5 px-1.5 h-5 before:content-none after:content-none">
                  <span className="ins-legend">Ws</span>
                  <span className="opacity-70">{workspace.name}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Workspace: {workspace.projects.map(p => p.name).join(' + ')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Context actions: tasks + update (shown when relevant) */}
        {(branchName && branchName !== 'main' && branchName !== 'master' || availableUpdate) && (
          <>
            <div className="flex items-center gap-0.5">
              {branchName && branchName !== 'main' && branchName !== 'master' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={onToggleBranchTasks}
                      className={cn("px-1 h-5 text-muted-foreground")}
                      data-lit={branchTasksOpen || undefined}
                    >
                      tasks
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Branch Tasks (Ctrl+Shift+T)</TooltipContent>
                </Tooltip>
              )}
              {availableUpdate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
                          openUrl(availableUpdate.url);
                        });
                      }}
                      className="gap-1.5 px-1 h-5 before:content-none after:content-none"
                    >
                      <Lamp state="ok" />
                      <span className="text-muted-foreground">[update {availableUpdate.version}]</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Update available — click to view release</TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}
      </div>

      {/* CENTRE: token gauge, the one live quantity on the rail. The wrapper
          keeps the grid's middle column even when the gauge has nothing to show. */}
      <div className="flex justify-center min-w-0">
        <ContextMeter tokenUsage={tokenUsage} currentPath={currentPath} />
      </div>

      {/* RIGHT: Runtime status + Settings */}
      <div className="flex items-center justify-end gap-1.5 min-w-0">
        {/* Transient status (changelog) — only visible when active */}
        {changelogStatus && (
          <ChangelogStatus status={changelogStatus} />
        )}

        {/* Runtime zone: CLI, sandbox, network. Jobs live
            in their own rail, so they are not repeated here. */}
        <div className="flex items-center gap-1.5">
          {selectedCli && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="xs" onClick={onOpenCliSettings} className="gap-1.5 px-1 h-5 lowercase before:content-none after:content-none">
                  <Lamp state={sessionId ? 'ok' : 'off'} />
                  {cliName}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Change CLI tool (Ctrl+K)</TooltipContent>
            </Tooltip>
          )}
          <SandboxSwitch enabled={sandboxEnabled} failed={sandboxFailed} onToggle={handleSandboxToggle} />
          {sandboxEnabled && (
            <NetworkSwitch isolated={networkIsolation} enabled={sandboxEnabled} onToggle={handleNetworkToggle} />
          )}
        </div>

        {/* Settings — visually separated as the final anchor */}
        <span className="w-px h-4 bg-[var(--tui-line)] mx-1" aria-hidden="true" />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs" className="px-1" aria-label="Open settings menu">
                  menu
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuLabel className="ins-legend text-[10px] font-normal">Analytics</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenDashboard} className="cursor-pointer py-1">
                <BarChart3 className="mr-2 w-3 h-3" />
                Token Metrics
                <DropdownMenuShortcut>Ctrl+Shift+D</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenBudgetSettings} className="cursor-pointer py-1">
                <Coins className="mr-2 w-3 h-3" />
                Token Budget
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="ins-legend text-[10px] font-normal">Automation</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenAutoChangelogDialog} className="cursor-pointer py-1">
                {autoChangelogEnabled ? (
                  <FileText className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.success }} />
                ) : (
                  <FileX className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.critical }} />
                )}
                Auto Changelog...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenAutoCommitConfig} className="cursor-pointer py-1">
                <CliIcon cli={autoCommitCli} />
                <span className="ml-2">Auto Commit...</span>
                <DropdownMenuShortcut>Ctrl+Shift+Space</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="ins-legend text-[10px] font-normal">Preferences</DropdownMenuLabel>
            <DropdownMenuGroup>
              <ThemeSwitcherMenuItem />
              <DropdownMenuItem onClick={onToggleHelp} className="cursor-pointer py-1">
                <Keyboard className="mr-2 w-3 h-3" />
                Keyboard Shortcuts
                <DropdownMenuShortcut>Ctrl+H</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleWatchers} className="cursor-pointer py-1">
                {fileWatchingEnabled ? <Eye className="mr-2 w-3 h-3" /> : <EyeOff className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.critical }} />}
                File Watching: {fileWatchingEnabled ? 'ON' : 'OFF'}
                <DropdownMenuShortcut>Ctrl+W</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleAutoLaunchCli} className="cursor-pointer py-1">
                {autoLaunchCli
                  ? <Bot className="mr-2 w-3 h-3" />
                  : <Bot className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.critical }} />}
                Auto-launch on starred: {autoLaunchCli ? 'ON' : 'OFF'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleTitleBar} className="cursor-pointer py-1">
                {showTitleBar ? <PanelTop className="mr-2 w-3 h-3" /> : <PanelTopClose className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.critical }} />}
                Title Bar: {showTitleBar ? 'ON' : 'OFF'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleInstrumentGlass} className="cursor-pointer py-1">
                <Monitor className="mr-2 w-3 h-3" style={instrumentGlass ? undefined : { color: STATUS_COLORS.critical }} />
                Glass: {instrumentGlass ? 'ON' : 'OFF'}
              </DropdownMenuItem>
              <ScrollbackMenuItem />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="ins-legend text-[10px] font-normal">Workspaces</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenWorkspaceDialog} className="cursor-pointer py-1">
                <Layers className="mr-2 w-3 h-3" />
                {workspace ? `Workspace: ${workspace.name}` : 'Workspaces...'}
              </DropdownMenuItem>
              {workspace && (
                <DropdownMenuItem onClick={onCloseWorkspace} className="cursor-pointer py-1">
                  <X className="mr-2 w-3 h-3" />
                  Close Workspace
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <ConfirmToggleDialog
      open={showSandboxConfirm}
      onOpenChange={setShowSandboxConfirm}
      title="Toggle Sandbox Mode?"
      description={<>This will <span className="font-medium text-destructive">reset and restart</span> your terminal session. Any running processes will be terminated and file system isolation will be {sandboxEnabled ? 'disabled' : 'enabled'}.</>}
      onConfirm={confirmSandboxToggle}
    />

    <ConfirmToggleDialog
      open={showNetworkConfirm}
      onOpenChange={setShowNetworkConfirm}
      title="Toggle Network Isolation?"
      description={<>This will <span className="font-medium text-destructive">reset and restart</span> your terminal session. Any running processes will be terminated and external network access will be {networkIsolation ? 'restored' : 'blocked'}.</>}
      onConfirm={confirmNetworkToggle}
    />
  </>
  );
});


// Terminal scrollback depth. Applies live to every open terminal (including
// other windows) through the terminalPrefs subscription.
function ScrollbackMenuItem() {
  const [value, setValue] = useState(() => getScrollback());

  useEffect(() => subscribeTerminalPrefs(() => setValue(getScrollback())), []);

  const current = SCROLLBACK_OPTIONS.find((o) => o.value === value);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="py-1">
        <Terminal className="mr-2 w-3 h-3" />
        Scrollback: {current ? current.label.replace(' lines', '') : value.toLocaleString()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="text-xs">
        {SCROLLBACK_OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => setScrollback(o.value)}
            className="cursor-pointer py-1"
          >
            {o.value === value && <Check className="mr-2 w-3 h-3" />}
            <span className={o.value === value ? '' : 'ml-5'}>{o.label}</span>
            {o.value > SCROLLBACK_WARN_THRESHOLD && (
              <span
                className="ml-auto flex items-center gap-1 pl-3 text-[10px] text-destructive/80"
                title="Uses a lot of memory per terminal and slows down resizing"
              >
                <AlertCircle className="w-3 h-3" />
                heavy
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
