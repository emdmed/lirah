import { useState, useRef, useEffect } from 'react';
import { ThemeSwitcher } from './ThemeSwitcher';
import { Keyboard, Eye, EyeOff, Download, Bot, Terminal, MoreVertical, PanelTop, PanelTopClose, Shield, ShieldOff, ShieldAlert, Wifi, WifiOff, Coins, BarChart3, FileText, FileX, Loader2, Check, AlertTriangle } from 'lucide-react';
import { useWatcher } from '../contexts/WatcherContext';
import { useWatcherShortcut } from '../hooks/useWatcherShortcut';
import { useTokenBudget } from '../contexts/TokenBudgetContext';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from './ui/dropdown-menu';

const CLI_DISPLAY = {
  'claude-code': { name: 'Claude Code', icon: Bot },
  'opencode': { name: 'opencode', icon: Terminal }
};

function BudgetIndicator({ projectPath, onOpenBudgetSettings }) {
  const { checkBudgetStatus, currentUsage, getBudget, formatTokenCount, formatCost } = useTokenBudget();
  const [popupOpen, setPopupOpen] = useState(false);
  const popupRef = useRef(null);

  const budget = getBudget(projectPath);
  const { status, percentage } = checkBudgetStatus(projectPath);

  useEffect(() => {
    if (!popupOpen) return;
    const handleClick = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setPopupOpen(false);
    };
    const handleEsc = (e) => { if (e.key === 'Escape') setPopupOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleEsc); };
  }, [popupOpen]);

  const barColor = status === 'critical' ? '#E82424' : status === 'warning' ? '#FF9E3B' : '#76946A';

  if (!budget) {
    return (
      <Button variant="ghost" size="xs" onClick={onOpenBudgetSettings} title="Set token budget" className="gap-1 px-1.5">
        <Coins className="w-3 h-3" />
        <span className="opacity-70 text-xs">Budget</span>
      </Button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setPopupOpen(!popupOpen)}
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-xs font-mono hover:bg-white/10 transition-colors"
        title="Token budget"
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
                    backgroundColor: (currentUsage.total / budget.weeklyLimit) >= 0.95 ? '#E82424' : (currentUsage.total / budget.weeklyLimit) >= 0.8 ? '#FF9E3B' : '#76946A',
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                {currentUsage.total.toLocaleString()} / {budget.weeklyLimit.toLocaleString()}
              </div>
            </div>
          )}

          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setPopupOpen(false); onOpenBudgetSettings(); }}>
            Budget Settings
          </Button>
        </div>
      )}
    </div>
  );
}

export const StatusBar = ({ viewMode, currentPath, sessionId, theme, onToggleHelp, onLaunchOrchestration, selectedCli, onOpenCliSettings, showTitleBar, onToggleTitleBar, sandboxEnabled, sandboxFailed, networkIsolation, onToggleNetworkIsolation, onToggleSandbox, secondaryTerminalFocused, onOpenBudgetSettings, onOpenDashboard, autoChangelogEnabled, changelogStatus, onOpenAutoChangelogDialog, autoCommitCli, onOpenAutoCommitConfig }) => {
  const { fileWatchingEnabled, toggleWatchers } = useWatcher();

  useWatcherShortcut({ onToggle: toggleWatchers, secondaryTerminalFocused });

  return (
    <div
      className="flex items-center justify-between px-4 py-2 border-t border-t-sketch text-xs font-mono"
      style={{
        backgroundColor: theme.background || '#1F1F28',
        color: theme.foreground || '#DCD7BA',
        height: '32px',
      }}
    >
      {/* Left section: Current path */}
      <div className="flex items-center gap-4 overflow-hidden">
        <span className="overflow-hidden whitespace-nowrap" style={{ textOverflow: 'ellipsis' }}>
          {currentPath || '~'}
        </span>
      </div>

      {/* Right section: Budget, CLI selector, Theme, and Settings menu */}
      <div className="flex items-center gap-2">
        {changelogStatus && (
          <span className="flex items-center gap-1 px-1.5 text-xs opacity-80">
            {changelogStatus === 'updating' && <Loader2 className="w-3 h-3 animate-spin" />}
            {changelogStatus === 'done' && <Check className="w-3 h-3" style={{ color: '#76946A' }} />}
            {changelogStatus === 'error' && <AlertTriangle className="w-3 h-3" style={{ color: '#E82424' }} />}
            <span>
              {changelogStatus === 'updating' && 'Updating changelog...'}
              {changelogStatus === 'done' && 'Changelog updated'}
              {changelogStatus === 'error' && 'Changelog failed'}
            </span>
          </span>
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={onOpenDashboard}
          title="Token Metrics (Ctrl+Shift+D)"
          className="gap-1 px-1.5"
        >
          <BarChart3 className="w-3 h-3" />
          <span className="opacity-70">Metrics</span>
        </Button>
        <BudgetIndicator projectPath={currentPath} onOpenBudgetSettings={onOpenBudgetSettings} />
        {selectedCli && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onOpenCliSettings}
            title="Change CLI tool (Ctrl+K)"
            className="gap-1.5"
          >
            {(() => {
              const CliIcon = CLI_DISPLAY[selectedCli]?.icon || Terminal;
              return <CliIcon className="w-3 h-3" />;
            })()}
            <span className="opacity-70">{CLI_DISPLAY[selectedCli]?.name || selectedCli}</span>
          </Button>
        )}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={onToggleSandbox}
            title={`Sandbox: ${sandboxEnabled && sandboxFailed ? 'FAILED' : sandboxEnabled ? 'ON' : 'OFF'}`}
            className="gap-1 px-1.5"
          >
            {sandboxEnabled && sandboxFailed ? (
              <ShieldAlert className="w-3 h-3" style={{ color: '#FF9E3B' }} />
            ) : sandboxEnabled ? (
              <Shield className="w-3 h-3" />
            ) : (
              <ShieldOff className="w-3 h-3" style={{ color: '#E82424' }} />
            )}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={onToggleNetworkIsolation}
            disabled={!sandboxEnabled}
            title={`Network: ${networkIsolation && sandboxEnabled ? 'ISOLATED' : 'ALLOWED'}`}
            className="gap-1 px-1.5"
          >
            {networkIsolation && sandboxEnabled ? (
              <WifiOff className="w-3 h-3" />
            ) : (
              <Wifi className="w-3 h-3" style={sandboxEnabled ? {} : { opacity: 0.4 }} />
            )}
          </Button>
        </div>
        <ThemeSwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Settings"
              aria-label="Open settings menu"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-120 text-xs [&_[role=menuitem]]:py-1 [&_[role=menuitem]]:text-xs [&_[role=menuitem]_svg]:size-3">
            <DropdownMenuItem
              onClick={onLaunchOrchestration}
              disabled={!sessionId}
              className="cursor-pointer"
            >
              <Download className="mr-1.5" />
              Add Orchestration
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onToggleHelp}
              className="cursor-pointer"
            >
              <Keyboard className="mr-1.5" />
              Keyboard Shortcuts
              <DropdownMenuShortcut>Ctrl+H</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={toggleWatchers}
              className="cursor-pointer"
            >
              {fileWatchingEnabled ? (
                <Eye className="mr-1.5" />
              ) : (
                <EyeOff className="mr-1.5" style={{ color: '#E82424' }} />
              )}
              File Watching: {fileWatchingEnabled ? 'ON' : 'OFF'}
              <DropdownMenuShortcut>Ctrl+W</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onOpenAutoChangelogDialog}
              className="cursor-pointer"
            >
              {autoChangelogEnabled ? (
                <FileText className="mr-1.5" style={{ color: '#76946A' }} />
              ) : (
                <FileX className="mr-1.5" style={{ color: '#E82424' }} />
              )}
              Auto Changelog...
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onOpenAutoCommitConfig}
              className="cursor-pointer"
            >
              {(() => {
                const Icon = CLI_DISPLAY[autoCommitCli]?.icon || Bot;
                return <Icon className="mr-1.5" />;
              })()}
              Auto Commit...
              <DropdownMenuShortcut>Ctrl+Shift+Space</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onToggleTitleBar}
              className="cursor-pointer"
            >
              {showTitleBar ? (
                <PanelTop className="mr-1.5" />
              ) : (
                <PanelTopClose className="mr-1.5" style={{ color: '#E82424' }} />
              )}
              Title Bar: {showTitleBar ? 'ON' : 'OFF'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
