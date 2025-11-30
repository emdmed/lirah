import { ThemeSwitcher } from './ThemeSwitcher';
import { HelpCircle } from 'lucide-react';

export const StatusBar = ({ viewMode, currentPath, sessionId, theme, showHelp, onToggleHelp }) => {
  return (
    <>
      {/* Help content section - compact single line */}
      {showHelp && (
        <div
          className="px-4 py-1.5 border-t text-[0.65rem] font-mono"
          style={{
            backgroundColor: theme.background || '#1F1F28',
            color: theme.foreground || '#DCD7BA',
            borderColor: 'rgba(255, 255, 255, 0.1)',
          }}
        >
          <div className="flex items-center gap-4 flex-wrap">
            <span className="opacity-70">Ctrl+S: Nav</span>
            <span className="opacity-70">Ctrl+K: Claude</span>
            <span className="opacity-30">|</span>
            <span className="opacity-70">Ctrl+T: Textarea</span>
            <span className="opacity-70">Ctrl+Enter: Send</span>
            <span className="opacity-30">|</span>
            <span className="opacity-70">Ctrl+F: Search</span>
            <span className="opacity-70">Ctrl+G: Git Filter</span>
            <span className="opacity-70">Ctrl+H: Help</span>
          </div>
        </div>
      )}

      {/* Status bar - always visible at bottom */}
      <div
        className="flex items-center justify-between px-4 py-2 border-t text-xs font-mono"
        style={{
          backgroundColor: theme.background || '#1F1F28',
          color: theme.foreground || '#DCD7BA',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          height: '32px',
        }}
      >
        {/* Left section: Current path */}
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="overflow-hidden whitespace-nowrap" style={{ textOverflow: 'ellipsis' }}>
            {currentPath || '~'}
          </span>
        </div>

        {/* Right section: Help, Theme switcher and session status */}
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleHelp}
            className="opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
            title="Keyboard shortcuts (Ctrl+H)"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          <ThemeSwitcher />
          <span style={{ color: theme.cursor || '#C8C093' }}>
            {sessionId ? `Session: ${sessionId.slice(0, 8)}` : 'No session'}
          </span>
        </div>
      </div>
    </>
  );
};
