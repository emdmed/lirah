import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Palette } from 'lucide-react';
import {
  Keyboard, Eye, EyeOff, Bot, Terminal,
  PanelTop, PanelTopClose, Coins, BarChart3, FileText, FileX, Check, AlertTriangle, AlertCircle,
  ListTodo, Layers, X, ArrowUpCircle
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
import { useAgentJobs } from '../features/agent-jobs/agent-jobs';
import { requestJobsPane } from '../features/agent-jobs/jobsPane';
import { getScrollback, setScrollback, SCROLLBACK_OPTIONS, subscribeTerminalPrefs } from '../lib/terminalPrefs';

const CLI_DISPLAY = {
  'claude-code': { name: 'Claude Code', icon: Bot },
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
    done: { icon: Check, text: 'Changelog updated', color: STATUS_COLORS.success },
    error: { icon: AlertTriangle, text: 'Changelog failed', color: STATUS_COLORS.critical }
  }), []);

  const { component: Component, icon: Icon, text, props, color } = config[status] || {};
  if (!Component && !Icon) return null;

  return (
    <span className="flex items-center gap-1 px-1.5 text-xs opacity-80">
      {Component ? (
        <Component {...props} />
      ) : (
        <Icon className="w-3 h-3" style={color ? { color } : undefined} />
      )}
      <span>{text}</span>
    </span>
  );
}

function SandboxButton({ enabled, failed, onToggle }) {
  const getIcon = () => {
    if (enabled && failed) return <span style={{ color: STATUS_COLORS.warning }}>fail</span>;
    if (enabled) return <span style={{ color: STATUS_COLORS.success }}>on</span>;
    return <span style={{ color: STATUS_COLORS.critical }}>off</span>;
  };

  const getTooltip = () => {
    if (enabled && failed) return 'Sandbox: FAILED';
    if (enabled) return 'Sandbox: ON';
    return 'Sandbox: OFF';
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="xs" onClick={onToggle} className="gap-0 px-1 before:content-none after:content-none">
          <span className="text-muted-foreground">sandbox:</span>{getIcon()}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{getTooltip()}</TooltipContent>
    </Tooltip>
  );
}

function NetworkButton({ isolated, enabled, onToggle }) {
  const icon = isolated && enabled ? <span style={{ color: STATUS_COLORS.warning }}>iso</span> : <span>open</span>;
  const tooltip = isolated && enabled ? 'Network: ISOLATED' : 'Network: ALLOWED';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="xs" onClick={onToggle} disabled={!enabled} className="gap-0 px-1 before:content-none after:content-none">
          <span className="text-muted-foreground">net:</span>{icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function InstanceSyncIndicator({ otherInstancesCount, onClick }) {
  const hasInstances = otherInstancesCount > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          onClick={onClick}
          className="gap-0 px-1 before:content-none after:content-none"
        >
          <span className="text-primary">{otherInstancesCount + 1}</span>
          <span className="text-muted-foreground">&nbsp;windows</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {hasInstances
          ? `${otherInstancesCount} other instance${otherInstancesCount > 1 ? 's' : ''} active (Ctrl+Shift+I)`
          : 'Instance Sync (Ctrl+Shift+I)'
        }
      </TooltipContent>
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
  viewMode, currentPath, sessionId, theme, onToggleHelp,
  selectedCli, onOpenCliSettings, showTitleBar,
  autoLaunchCli, onToggleAutoLaunchCli,
  onToggleTitleBar, sandboxEnabled, sandboxFailed, networkIsolation,
  onToggleNetworkIsolation, onToggleSandbox, secondaryTerminalFocused,
  onOpenBudgetSettings, onOpenDashboard, autoChangelogEnabled, changelogStatus,
  onOpenAutoChangelogDialog, autoCommitCli, onOpenAutoCommitConfig, branchName,
  onToggleBranchTasks, branchTasksOpen, otherInstancesCount, onToggleInstanceSyncPanel,
  workspace, onOpenWorkspaceDialog, onCloseWorkspace, onClearContext,
  availableUpdate
}) => {
  const { fileWatchingEnabled, toggleWatchers } = useWatcher();
  const [showSandboxConfirm, setShowSandboxConfirm] = useState(false);
  const [showNetworkConfirm, setShowNetworkConfirm] = useState(false);
  const { jobs } = useAgentJobs();
  const jobCounts = useMemo(() => {
    const visible = jobs.filter((j) => !j.archived);
    return { total: visible.length, running: visible.filter((j) => j.status === 'running').length };
  }, [jobs]);

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
      className="chassis-rail flex items-center justify-between pr-1 h-8 text-xs font-mono"
      style={{
        color: theme.foreground || 'var(--color-foreground)',
      }}
    >
      {/* LEFT: Location + Context */}
      <div className="flex items-center gap-1 overflow-hidden min-w-0">
        {/* Location group: path + workspace + branch */}
        <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
          <span className="overflow-hidden whitespace-nowrap text-ellipsis bg-primary text-primary-foreground px-2 self-stretch flex items-center">
            [{currentPath ? currentPath.split('/').pop() || '~' : '~'}]
          </span>
          {workspace && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="xs" onClick={onOpenWorkspaceDialog} className="gap-1 px-1.5 h-5">
                  <Layers className="w-3 h-3" />
                  <span className="opacity-70">{workspace.name}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Workspace: {workspace.projects.map(p => p.name).join(' + ')}
              </TooltipContent>
            </Tooltip>
          )}
          {branchName && (
            <span className="whitespace-nowrap text-muted-foreground">
              ± <span className="text-foreground">{branchName}</span>
            </span>
          )}
        </div>

        {/* Context actions: tasks + update (shown when relevant) */}
        {(branchName && branchName !== 'main' && branchName !== 'master' || availableUpdate) && (
          <>
            <span className="text-[var(--tui-line-strong)] mx-0.5 shrink-0 select-none">│</span>
            <div className="flex items-center gap-0.5">
              {branchName && branchName !== 'main' && branchName !== 'master' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={onToggleBranchTasks}
                      className={cn(
                        "gap-1 px-1.5 h-5 transition-colors",
                        branchTasksOpen && "bg-foreground/10"
                      )}
                    >
                      <ListTodo className="w-3 h-3" />
                      <span className="opacity-70">Tasks</span>
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
                      className="gap-1 px-1.5 h-5"
                    >
                      <ArrowUpCircle className="w-3 h-3" style={{ color: STATUS_COLORS.success }} />
                      <span className="opacity-70">{availableUpdate.version}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Update available — click to view release</TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}
      </div>

      {/* RIGHT: Runtime status + Settings */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Transient status (changelog) — only visible when active */}
        {changelogStatus && (
          <ChangelogStatus status={changelogStatus} />
        )}

        {/* Runtime zone: instances + CLI + sandbox + network — unified background */}
        <div className="flex items-center gap-0.5">
          {jobCounts.total > 0 && (
            <>
              <Button variant="ghost" size="xs" onClick={() => requestJobsPane('toggle')} className="gap-0 px-1 before:content-none after:content-none" title="Toggle jobs pane (Alt+4)">
                <span className="text-muted-foreground">jobs:</span>
                <span style={jobCounts.running > 0 ? { color: STATUS_COLORS.success } : undefined}>
                  {jobCounts.running > 0 ? `${jobCounts.running} running` : jobCounts.total}
                </span>
              </Button>
              <span className="text-[var(--tui-line-strong)] mx-0.5 select-none">│</span>
            </>
          )}
          {otherInstancesCount > 0 && (
            <>
              <InstanceSyncIndicator
                otherInstancesCount={otherInstancesCount}
                onClick={onToggleInstanceSyncPanel}
              />
              <span className="text-[var(--tui-line-strong)] mx-0.5 select-none">│</span>
            </>
          )}
          {selectedCli && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="xs" onClick={onOpenCliSettings} className="gap-1 px-1 h-5 lowercase before:content-none after:content-none">
                  {cliName}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Change CLI tool (Ctrl+K)</TooltipContent>
            </Tooltip>
          )}
          <span className="text-[var(--tui-line-strong)] mx-0.5 select-none">│</span>
          <SandboxButton enabled={sandboxEnabled} failed={sandboxFailed} onToggle={handleSandboxToggle} />
          {sandboxEnabled && (
            <NetworkButton isolated={networkIsolation} enabled={sandboxEnabled} onToggle={handleNetworkToggle} />
          )}
        </div>

        {/* Settings — visually separated as the final anchor */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs" className="px-1.5 bg-foreground/10 before:content-none after:content-none" aria-label="Open settings menu">
                  menu
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-normal">Analytics</DropdownMenuLabel>
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
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-normal">Automation</DropdownMenuLabel>
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
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-normal">Preferences</DropdownMenuLabel>
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
              <ScrollbackMenuItem />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-normal">Workspaces</DropdownMenuLabel>
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
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
