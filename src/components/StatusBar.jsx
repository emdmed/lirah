import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Palette } from 'lucide-react';
import {
  Keyboard, Eye, EyeOff, Bot, Terminal, Settings,
  PanelTop, PanelTopClose, Shield, ShieldOff, ShieldAlert, Wifi, WifiOff,
  Coins, BarChart3, FileText, FileX, Check, AlertTriangle, AlertCircle,
  CheckCircle2, ListTodo, Monitor, Layers, X, ArrowUpCircle
} from 'lucide-react';
import { RetroSpinner } from './ui/RetroSpinner';
import { useWatcher } from '../features/watcher';
import { useWatcherShortcut } from '../features/watcher';
import { Button } from './ui/button';
import { Badge } from "./ui/badge.jsx"
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
    if (enabled && failed) return <ShieldAlert className="w-3 h-3" style={{ color: STATUS_COLORS.warning }} />;
    if (enabled) return <Shield className="w-3 h-3" />;
    return <ShieldOff className="w-3 h-3" style={{ color: STATUS_COLORS.critical }} />;
  };

  const getTooltip = () => {
    if (enabled && failed) return 'Sandbox: FAILED';
    if (enabled) return 'Sandbox: ON';
    return 'Sandbox: OFF';
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="xs" onClick={onToggle} className="gap-1 px-1.5">
          {getIcon()}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{getTooltip()}</TooltipContent>
    </Tooltip>
  );
}

function NetworkButton({ isolated, enabled, onToggle }) {
  const icon = isolated && enabled ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" style={enabled ? {} : { opacity: 0.4 }} />;
  const tooltip = isolated && enabled ? 'Network: ISOLATED' : 'Network: ALLOWED';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="xs" onClick={onToggle} disabled={!enabled} className="gap-1 px-1.5">
          {icon}
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
          className="gap-1 px-1.5"
        >
          <Monitor className="w-3 h-3" />
          {hasInstances && (
            <span className="text-xs font-medium">{otherInstancesCount}</span>
          )}
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
      <DialogContent className="sm:max-w-[440px] border-destructive/30 border-sketch bg-destructive/5">
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
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="border-sketch">
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

export const StatusBar = ({
  viewMode, currentPath, sessionId, theme, onToggleHelp,
  selectedCli, onOpenCliSettings, showTitleBar,
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
      className="flex items-center justify-between px-2 h-8 border-t border-t-sketch text-xs font-mono"
      style={{
        backgroundColor: theme.background || 'var(--color-background)',
        color: theme.foreground || 'var(--color-foreground)',
      }}
    >
      {/* LEFT: Location + Context */}
      <div className="flex items-center gap-1 overflow-hidden min-w-0">
        {/* Location group: path + workspace + branch */}
        <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
          <span className="overflow-hidden whitespace-nowrap text-ellipsis opacity-70">
            {currentPath ? currentPath.split('/').pop() || '~' : '~'}
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
            <Badge variant="secondary">
              {branchName}
            </Badge>
          )}
        </div>

        {/* Context actions: tasks + update (shown when relevant) */}
        {(branchName && branchName !== 'main' && branchName !== 'master' || availableUpdate) && (
          <>
            <div className="w-px h-3 bg-border/30 mx-0.5 shrink-0" />
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
        <div className="flex items-center gap-0.5 bg-secondary/20 px-1 py-0.5">
          <InstanceSyncIndicator
            otherInstancesCount={otherInstancesCount}
            onClick={onToggleInstanceSyncPanel}
          />
          <div className="w-px h-3 bg-border/20 mx-0.5" />
          {selectedCli && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="xs" onClick={onOpenCliSettings} className="gap-1 px-1.5 h-5">
                  <CliIcon cli={selectedCli} />
                  <span className="opacity-60">{cliName}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Change CLI tool (Ctrl+K)</TooltipContent>
            </Tooltip>
          )}
          <div className="w-px h-3 bg-border/20 mx-0.5" />
          <SandboxButton enabled={sandboxEnabled} failed={sandboxFailed} onToggle={handleSandboxToggle} />
          <NetworkButton isolated={networkIsolation} enabled={sandboxEnabled} onToggle={handleNetworkToggle} />
        </div>

        {/* Settings — visually separated as the final anchor */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs" className="h-6 w-6 p-0" aria-label="Open settings menu">
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-normal">Analytics</DropdownMenuLabel>
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
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-normal">Automation</DropdownMenuLabel>
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
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-normal">Preferences</DropdownMenuLabel>
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
              <DropdownMenuItem onClick={onToggleTitleBar} className="cursor-pointer py-1">
                {showTitleBar ? <PanelTop className="mr-2 w-3 h-3" /> : <PanelTopClose className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.critical }} />}
                Title Bar: {showTitleBar ? 'ON' : 'OFF'}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-normal">Workspaces</DropdownMenuLabel>
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
};
