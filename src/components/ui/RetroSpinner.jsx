/**
 * Retro-style loading spinner with dual rotating squares
 * Technical/engineering aesthetic with configurable size and line width
 */
export function RetroSpinner({ size = 20, lineWidth = 1, className = '' }) {
  const dimension = size;
  return (
    <div 
      className={`relative inline-block ${className}`}
      style={{ width: dimension, height: dimension }}
    >
      <div 
        className="absolute left-0 top-0 border-foreground/60"
        style={{ 
          width: dimension, 
          height: dimension,
          borderWidth: lineWidth,
          animation: 'loader-rotation 2s ease-in-out infinite'
        }}
      />
      <div 
        className="absolute left-0 top-0 border-primary"
        style={{ 
          width: dimension, 
          height: dimension,
          borderWidth: lineWidth,
          animation: 'loader-rotation 2s ease-in-out infinite',
          animationDelay: '1s'
        }}
      />
      <style>{`
        @keyframes loader-rotation {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
