// Claude Code's pixel mascot, from the block characters it prints at startup.
// `idle` greys it out: Claude Code is the tab's CLI but isn't running.
export function ClaudeMark({ size = 12, idle = false }) {
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 18 12" shapeRendering="crispEdges" role="img" aria-label={idle ? 'Claude Code idle' : 'Claude Code running'} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path fill={idle ? 'var(--ins-faint)' : '#D77757'} d="M3 0h1v2h-1zM3 2h1v2h-1zM4 0h1v2h-1zM5 0h1v2h-1zM4 2h1v2h-1zM6 0h1v2h-1zM7 0h1v2h-1zM6 2h1v2h-1zM7 2h1v2h-1zM8 0h1v2h-1zM9 0h1v2h-1zM8 2h1v2h-1zM9 2h1v2h-1zM10 0h1v2h-1zM11 0h1v2h-1zM10 2h1v2h-1zM11 2h1v2h-1zM12 0h1v2h-1zM13 0h1v2h-1zM13 2h1v2h-1zM14 0h1v2h-1zM14 2h1v2h-1zM1 4h1v2h-1zM2 4h1v2h-1zM3 4h1v2h-1zM3 6h1v2h-1zM4 4h1v2h-1zM5 4h1v2h-1zM4 6h1v2h-1zM5 6h1v2h-1zM6 4h1v2h-1zM7 4h1v2h-1zM6 6h1v2h-1zM7 6h1v2h-1zM8 4h1v2h-1zM9 4h1v2h-1zM8 6h1v2h-1zM9 6h1v2h-1zM10 4h1v2h-1zM11 4h1v2h-1zM10 6h1v2h-1zM11 6h1v2h-1zM12 4h1v2h-1zM13 4h1v2h-1zM12 6h1v2h-1zM13 6h1v2h-1zM14 4h1v2h-1zM15 4h1v2h-1zM14 6h1v2h-1zM16 4h1v2h-1zM4 8h1v2h-1zM6 8h1v2h-1zM11 8h1v2h-1zM13 8h1v2h-1z" />
    </svg>
  );
}
