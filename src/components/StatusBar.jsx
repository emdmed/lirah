import { Badge } from './ui/badge';

export const StatusBar = ({ viewMode, currentPath, sessionId, theme }) => {
  const modeLabel = viewMode === 'tree' ? 'CLAUDE MODE' : 'NAVIGATION MODE';

  return (
    <div
      className="flex items-center justify-between px-4 py-2 border-t text-xs font-mono"
      style={{
        backgroundColor: theme.background || '#1F1F28',
        color: theme.foreground || '#DCD7BA',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        height: '32px',
      }}
    >
      {/* Left section: Mode indicator */}
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          style={{
            backgroundColor: viewMode === 'tree' ? '#7E9CD8' : '#E6C384',
            color: '#1F1F28',
            border: 'none',
            fontSize: '0.65rem',
            padding: '0.15rem 0.5rem',
          }}
        >
          {modeLabel}
        </Badge>
      </div>

      {/* Center section: Current path */}
      <div
        className="flex-1 px-4 overflow-hidden whitespace-nowrap"
        style={{
          textOverflow: 'ellipsis',
          textAlign: 'center',
        }}
      >
        {currentPath || '~'}
      </div>

      {/* Right section: Session status */}
      <div className="flex items-center gap-2">
        <span style={{ color: theme.cursor || '#C8C093' }}>
          {sessionId ? `Session: ${sessionId.slice(0, 8)}` : 'No session'}
        </span>
      </div>
    </div>
  );
};
