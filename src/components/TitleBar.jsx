import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Lamp } from './instrument/Lamp';
import { LirahMark } from './LirahMark';

export const TitleBar = ({ hasTerminalSession = false, currentPath }) => {
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
      className="flex items-center justify-between px-3 h-[30px] shrink-0 edge-b-engraved bg-[var(--tui-bar)] text-xs font-mono select-none"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2 min-w-0 pointer-events-none" data-tauri-drag-region>
        <LirahMark size={18} title="Lirah" className="shrink-0" />
        <Lamp state={hasTerminalSession ? 'on' : 'off'} label={hasTerminalSession ? 'Session live' : 'No session'} />
        {currentPath && <span className="text-muted-foreground truncate">{currentPath}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => appWindow.minimize()}
          className="ins-cap ins-round text-muted-foreground hover:text-foreground"
          title="Minimize"
          aria-label="Minimize"
        >
          _
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="ins-cap ins-round text-muted-foreground hover:text-foreground"
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? '=' : '□'}
        </button>
        <button
          onClick={() => appWindow.close()}
          className="ins-cap ins-round text-muted-foreground hover:text-[var(--ins-fault)] hover:border-[var(--ins-fault)]"
          title="Close"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
};
