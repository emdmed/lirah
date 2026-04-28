import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X } from 'lucide-react';

export const TitleBar = ({ theme }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const unlisten = appWindow.onResized(async () => {
      setIsMaximized(await appWindow.isMaximized());
    });
    // Check initial state
    appWindow.isMaximized().then(setIsMaximized);
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return (
    <div
      className="flex items-center justify-between px-4 h-8 shrink-0 border-b border-b-sketch text-xs font-mono select-none"
      data-tauri-drag-region
      style={{
        backgroundColor: theme.background || 'var(--color-background)',
        color: theme.foreground || 'var(--color-foreground)',
      }}
    >
      <span className="opacity-70 pointer-events-none" data-tauri-drag-region>Lirah</span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => appWindow.minimize()}
          className="p-1.5 rounded-xs hover:bg-foreground/10 transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="p-1.5 rounded-xs hover:bg-foreground/10 transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => appWindow.close()}
          className="p-1.5 rounded-xs hover:bg-destructive/80 transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
