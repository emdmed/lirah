import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
      className="flex items-center justify-between px-4 h-8 shrink-0 border-b edge-b-engraved text-xs font-mono select-none"
      data-tauri-drag-region
      style={{
        backgroundColor: theme.background || 'var(--color-background)',
        color: theme.foreground || 'var(--color-foreground)',
      }}
    >
      <span className="text-muted-foreground pointer-events-none" data-tauri-drag-region>lirah</span>
      <div className="flex items-center h-full">
        <button
          onClick={() => appWindow.minimize()}
          className="px-2 h-full text-muted-foreground hover:bg-foreground hover:text-background"
          title="Minimize"
        >
          [_]
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="px-2 h-full text-muted-foreground hover:bg-foreground hover:text-background"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? '[=]' : '[□]'}
        </button>
        <button
          onClick={() => appWindow.close()}
          className="px-2 h-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
          title="Close"
        >
          [x]
        </button>
      </div>
    </div>
  );
};
