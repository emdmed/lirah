import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { IS_MAC } from '../utils/pathUtils';

// The window has no native frame, so these are its minimize, maximize and
// close buttons. Shown in the app header.
export const WindowControls = () => {
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

  const minimize = (
    <button
      key="min"
      onClick={() => appWindow.minimize()}
      className="ins-cap ins-round text-muted-foreground hover:text-foreground"
      title="Minimize"
      aria-label="Minimize"
    >
      _
    </button>
  );
  const maximize = (
    <button
      key="max"
      onClick={() => appWindow.toggleMaximize()}
      className="ins-cap ins-round text-muted-foreground hover:text-foreground"
      title={isMaximized ? 'Restore' : 'Maximize'}
      aria-label={isMaximized ? 'Restore' : 'Maximize'}
    >
      {isMaximized ? '=' : '□'}
    </button>
  );
  const close = (
    <button
      key="close"
      onClick={() => appWindow.close()}
      className="ins-cap ins-round text-muted-foreground hover:text-[var(--ins-fault)] hover:border-[var(--ins-fault)]"
      title="Close"
      aria-label="Close"
    >
      ×
    </button>
  );

  return (
    <div className="flex items-center gap-1.5">
      {IS_MAC ? [close, minimize, maximize] : [minimize, maximize, close]}
    </div>
  );
};
