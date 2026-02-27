import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ThemeSwitcher } from './ThemeSwitcher';
import {
  Keyboard, Eye, EyeOff, Download, Bot, Terminal, MoreVertical,
  PanelTop, PanelTopClose, Shield, ShieldOff, ShieldAlert, Wifi, WifiOff,
  Coins, BarChart3, FileText, FileX, Check, AlertTriangle, AlertCircle,
  CheckCircle2, ListTodo, Monitor
} from 'lucide-react';
import { RetroSpinner } from './ui/RetroSpinner';
import { useWatcher } from '../contexts/WatcherContext';
import { useWatcherShortcut } from '../hooks/useWatcherShortcut';
import { useTokenBudget } from '../contexts/TokenBudgetContext';
import { Button } from './ui/button';
import { Badge } from "./ui/badge.jsx"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuShortcut,
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

function BudgetIndicator({ projectPath, onOpenBudgetSettings }) {
  const { checkBudgetStatus, currentUsage, getBudget, formatCost } = useTokenBudget();
  const [popupOpen, setPopupOpen] = useState(false);
  const popupRef = useRef(null);

  const budget = getBudget(projectPath);
  const { status, percentage } = checkBudgetStatus(projectPath);

  const closePopup = useCallback(() => setPopupOpen(false), []);

  useEffect(() => {
    if (!popupOpen) return;
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) closePopup();
    };
    const handleEsc = (e) => { if (e.key === 'Escape') closePopup(); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [popupOpen, closePopup]);

  const barColor = STATUS_COLORS[status] || STATUS_COLORS.success;

  if (!budget) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="xs" onClick={onOpenBudgetSettings} className="gap-1 px-1.5">
            <Coins className="w-3 h-3" />
            <span className="opacity-70 text-xs">Budget</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Set token budget</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setPopupOpen(!popupOpen)}
            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-xs font-mono hover:bg-white/10 transition-colors"
          >
            <Coins className="w-3 h-3" />
            <div className="flex items-center gap-1">
              <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${percentage}%`, backgroundColor: barColor }} />
              </div>
              <span className="opacity-70">{Math.round(percentage)}%</span>
            </div>
            <span className="opacity-50">{formatCost(currentUsage.cost)}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Token budget usage</TooltipContent>
      </Tooltip>

      {popupOpen && (
        <div
          ref={popupRef}
          className="absolute bottom-full right-0 mb-2 w-64 rounded-md border border-border bg-popover p-3 shadow-md z-50"
        >
          <div className="text-xs font-medium mb-3">Token Budget</div>

          {budget.dailyLimit && (
            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Today</span>
                <span className="font-mono">{Math.round(percentage)}%</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${percentage}%`, backgroundColor: barColor }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground font-mono">
                <span>{currentUsage.total.toLocaleString()} / {budget.dailyLimit.toLocaleString()}</span>
                <span>{formatCost(currentUsage.cost)}</span>
              </div>
            </div>
          )}

          {budget.weeklyLimit && (
            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">This Week</span>
                <span className="font-mono">{Math.round(Math.min((currentUsage.total / budget.weeklyLimit) * 100, 100))}%</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min((currentUsage.total / budget.weeklyLimit) * 100, 100)}%`,
                    backgroundColor: (currentUsage.total / budget.weeklyLimit) >= 0.95 ? STATUS_COLORS.critical : (currentUsage.total / budget.weeklyLimit) >= 0.8 ? STATUS_COLORS.warning : STATUS_COLORS.success,
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                {currentUsage.total.toLocaleString()} / {budget.weeklyLimit.toLocaleString()}
              </div>
            </div>
          )}

          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { closePopup(); onOpenBudgetSettings(); }}>
            Budget Settings
          </Button>
        </div>
      )}
    </div>
  );
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
          className={cn(
            "gap-1 px-1.5 transition-colors",
            hasInstances && "text-blue-400 hover:text-blue-300"
          )}
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

export const StatusBar = ({
  viewMode, currentPath, sessionId, theme, onToggleHelp,
  onLaunchOrchestration, selectedCli, onOpenCliSettings, showTitleBar,
  onToggleTitleBar, sandboxEnabled, sandboxFailed, networkIsolation,
  onToggleNetworkIsolation, onToggleSandbox, secondaryTerminalFocused,
  onOpenBudgetSettings, onOpenDashboard, autoChangelogEnabled, changelogStatus,
  onOpenAutoChangelogDialog, autoCommitCli, onOpenAutoCommitConfig, branchName,
  onToggleBranchTasks, branchTasksOpen, otherInstancesCount, onToggleInstanceSyncPanel
}) => {
  const { fileWatchingEnabled, toggleWatchers } = useWatcher();
  const [showSandboxConfirm, setShowSandboxConfirm] = useState(false);
  const [showNetworkConfirm, setShowNetworkConfirm] = useState(false);

  useWatcherShortcut({ onToggle: toggleWatchers, secondaryTerminalFocused });

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
      className="flex items-center justify-between px-4 py-2 border-t border-t-sketch text-xs font-mono"
      style={{
        backgroundColor: theme.background || '#1F1F28',
        color: theme.foreground || '#DCD7BA',
        height: '32px',
      }}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="overflow-hidden whitespace-nowrap text-ellipsis">
          {currentPath ? currentPath.split('/').pop() || '~' : '~'}
        </span>
        {branchName && (
          <Badge variant="secondary">
            {branchName}
          </Badge>
        )}
        {branchName && branchName !== 'main' && branchName !== 'master' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="xs" 
                onClick={onToggleBranchTasks}
                className={cn(
                  "gap-1 px-1.5 h-5 transition-colors",
                  branchTasksOpen && "bg-white/10"
                )}
              >
                <ListTodo className="w-3 h-3" />
                <span className="opacity-70">Tasks</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Branch Tasks (Ctrl+Shift+T)</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Status Zone */}
        {changelogStatus && (
          <>
            <ChangelogStatus status={changelogStatus} />
            <div className="w-px h-4 bg-border/50 mx-1" />
          </>
        )}

        {/* Data & Analytics Zone */}
        <div className="flex items-center gap-1 bg-secondary/30 rounded px-1.5 py-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="xs" onClick={onOpenDashboard} className="gap-1 px-1.5 h-5">
                <BarChart3 className="w-3 h-3" />
                <span className="opacity-70">Metrics</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Token Metrics (Ctrl+Shift+D)</TooltipContent>
          </Tooltip>
          <div className="w-px h-3 bg-border/30 mx-0.5" />
          <BudgetIndicator projectPath={currentPath} onOpenBudgetSettings={onOpenBudgetSettings} />
        </div>

        {/* Instance Sync Zone */}
        <InstanceSyncIndicator 
          otherInstancesCount={otherInstancesCount} 
          onClick={onToggleInstanceSyncPanel} 
        />

        <div className="w-px h-4 bg-border/50 mx-1" />

        {/* Environment Zone */}
        <div className="flex items-center gap-0.5 bg-secondary/30 rounded px-1.5 py-0.5">
          {selectedCli && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="xs" onClick={onOpenCliSettings} className="gap-1.5 px-1.5 h-5">
                  <CliIcon cli={selectedCli} />
                  <span className="opacity-70">{cliName}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Change CLI tool (Ctrl+K)</TooltipContent>
            </Tooltip>
          )}
          <div className="w-px h-3 bg-border/30 mx-0.5" />
          <SandboxButton enabled={sandboxEnabled} failed={sandboxFailed} onToggle={handleSandboxToggle} />
          <NetworkButton isolated={networkIsolation} enabled={sandboxEnabled} onToggle={handleNetworkToggle} />
        </div>

        <div className="w-px h-4 bg-border/50 mx-1" />

        {/* App Controls Zone */}
        <div className="flex items-center gap-0.5">
          <ThemeSwitcher />
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs" className="h-6 w-6 p-0" aria-label="Open settings menu">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-100 text-xs">
              <DropdownMenuItem onClick={onLaunchOrchestration} disabled={!sessionId} className="cursor-pointer py-1">
                <Download className="mr-2 w-3 h-3" />
                Add Orchestration
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
              <DropdownMenuItem onClick={onToggleTitleBar} className="cursor-pointer py-1">
                {showTitleBar ? <PanelTop className="mr-2 w-3 h-3" /> : <PanelTopClose className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.critical }} />}
                Title Bar: {showTitleBar ? 'ON' : 'OFF'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>

    {/* Sandbox Toggle Confirmation Dialog */}
    <Dialog open={showSandboxConfirm} onOpenChange={setShowSandboxConfirm}>
      <DialogContent className="sm:max-w-[440px] border-destructive/30 border-sketch bg-destructive/5">
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-base font-semibold">
              Toggle Sandbox Mode?
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            This will <span className="font-medium text-destructive">reset and restart</span> your terminal session. Any running processes will be terminated. You'll need to restart your CLI agent after toggling.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-end gap-2 sm:justify-end mt-4">
          <Button variant="outline" size="sm" onClick={() => setShowSandboxConfirm(false)} className="border-sketch">
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={confirmSandboxToggle}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Network Isolation Toggle Confirmation Dialog */}
    <Dialog open={showNetworkConfirm} onOpenChange={setShowNetworkConfirm}>
      <DialogContent className="sm:max-w-[440px] border-destructive/30 border-sketch bg-destructive/5">
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-base font-semibold">
              Toggle Network Isolation?
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            This will <span className="font-medium text-destructive">reset and restart</span> your terminal session. Any running processes will be terminated. You'll need to restart your CLI agent after toggling.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-end gap-2 sm:justify-end mt-4">
          <Button variant="outline" size="sm" onClick={() => setShowNetworkConfirm(false)} className="border-sketch">
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={confirmNetworkToggle}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
};
