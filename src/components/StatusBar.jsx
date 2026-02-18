import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ThemeSwitcher } from './ThemeSwitcher';
import {
  Keyboard, Eye, EyeOff, Download, Bot, Terminal, MoreVertical,
  PanelTop, PanelTopClose, Shield, ShieldOff, ShieldAlert, Wifi, WifiOff,
  Coins, BarChart3, FileText, FileX, Loader2, Check, AlertTriangle
} from 'lucide-react';
import { useWatcher } from '../contexts/WatcherContext';
import { useWatcherShortcut } from '../hooks/useWatcherShortcut';
import { useTokenBudget } from '../contexts/TokenBudgetContext';
import { Button } from './ui/button';
import { Badge } from "./ui/badge.jsx"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuShortcut,
} from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const CLI_DISPLAY = {
  'claude-code': { name: 'Claude Code', icon: Bot },
  'opencode': { name: 'opencode', icon: Terminal }
};

const STATUS_COLORS = {
  critical: '#E82424',
  warning: '#FF9E3B',
  success: '#76946A'
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
    updating: { icon: Loader2, text: 'Updating changelog...', className: 'animate-spin' },
    done: { icon: Check, text: 'Changelog updated', color: STATUS_COLORS.success },
    error: { icon: AlertTriangle, text: 'Changelog failed', color: STATUS_COLORS.critical }
  }), []);

  const { icon: Icon, text, className, color } = config[status] || {};
  if (!Icon) return null;

  return (
    <span className="flex items-center gap-1 px-1.5 text-xs opacity-80">
      <Icon className={`w-3 h-3 ${className || ''}`} style={color ? { color } : undefined} />
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

export const StatusBar = ({
  viewMode, currentPath, sessionId, theme, onToggleHelp,
  onLaunchOrchestration, selectedCli, onOpenCliSettings, showTitleBar,
  onToggleTitleBar, sandboxEnabled, sandboxFailed, networkIsolation,
  onToggleNetworkIsolation, onToggleSandbox, secondaryTerminalFocused,
  onOpenBudgetSettings, onOpenDashboard, autoChangelogEnabled, changelogStatus,
  onOpenAutoChangelogDialog, autoCommitCli, onOpenAutoCommitConfig, branchName
}) => {
  const { fileWatchingEnabled, toggleWatchers } = useWatcher();

  useWatcherShortcut({ onToggle: toggleWatchers, secondaryTerminalFocused });

  const cliName = CLI_DISPLAY[selectedCli]?.name || selectedCli;

  return (
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
      </div>

      <div className="flex items-center gap-2">
        {changelogStatus && <ChangelogStatus status={changelogStatus} />}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="xs" onClick={onOpenDashboard} className="gap-1 px-1.5">
              <BarChart3 className="w-3 h-3" />
              <span className="opacity-70">Metrics</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Token Metrics (Ctrl+Shift+D)</TooltipContent>
        </Tooltip>

        <BudgetIndicator projectPath={currentPath} onOpenBudgetSettings={onOpenBudgetSettings} />

        {selectedCli && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="xs" onClick={onOpenCliSettings} className="gap-1.5">
                <CliIcon cli={selectedCli} />
                <span className="opacity-70">{cliName}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Change CLI tool (Ctrl+K)</TooltipContent>
          </Tooltip>
        )}

        <div className="flex items-center gap-0.5">
          <SandboxButton enabled={sandboxEnabled} failed={sandboxFailed} onToggle={onToggleSandbox} />
          <NetworkButton isolated={networkIsolation} enabled={sandboxEnabled} onToggle={onToggleNetworkIsolation} />
        </div>

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
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuItem onClick={onLaunchOrchestration} disabled={!sessionId} className="cursor-pointer py-1.5">
              <Download className="mr-2 w-3 h-3" />
              Add Orchestration
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onToggleHelp} className="cursor-pointer py-1.5">
              <Keyboard className="mr-2 w-3 h-3" />
              Keyboard Shortcuts
              <DropdownMenuShortcut>Ctrl+H</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleWatchers} className="cursor-pointer py-1.5">
              {fileWatchingEnabled ? <Eye className="mr-2 w-3 h-3" /> : <EyeOff className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.critical }} />}
              File Watching: {fileWatchingEnabled ? 'ON' : 'OFF'}
              <DropdownMenuShortcut>Ctrl+W</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenAutoChangelogDialog} className="cursor-pointer py-1.5">
              {autoChangelogEnabled ? (
                <FileText className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.success }} />
              ) : (
                <FileX className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.critical }} />
              )}
              Auto Changelog...
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenAutoCommitConfig} className="cursor-pointer py-1.5">
              <CliIcon cli={autoCommitCli} />
              <span className="ml-2">Auto Commit...</span>
              <DropdownMenuShortcut>Ctrl+Shift+Space</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleTitleBar} className="cursor-pointer py-1.5">
              {showTitleBar ? <PanelTop className="mr-2 w-3 h-3" /> : <PanelTopClose className="mr-2 w-3 h-3" style={{ color: STATUS_COLORS.critical }} />}
              Title Bar: {showTitleBar ? 'ON' : 'OFF'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
