import { ThemeSwitcher } from './ThemeSwitcher';
import { Keyboard, Eye, EyeOff, Download, Bot, Terminal, MoreVertical, PanelTop, PanelTopClose, Shield, ShieldOff, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { useWatcher } from '../contexts/WatcherContext';
import { useWatcherShortcut } from '../hooks/useWatcherShortcut';
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

export const StatusBar = ({ viewMode, currentPath, sessionId, theme, onToggleHelp, onLaunchOrchestration, selectedCli, onOpenCliSettings, showTitleBar, onToggleTitleBar, sandboxEnabled, sandboxFailed, networkIsolation, onToggleNetworkIsolation, onToggleSandbox, secondaryTerminalFocused }) => {
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

      {/* Right section: CLI selector, Theme, and Settings menu */}
      <div className="flex items-center gap-2">
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
          <DropdownMenuContent align="end" className="w-80 text-xs [&_[role=menuitem]]:py-1 [&_[role=menuitem]]:text-xs [&_[role=menuitem]_svg]:size-3">
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
