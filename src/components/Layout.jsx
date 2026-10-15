export function Layout({ sidebar, children, statusBar, textarea, titleBar, secondaryTerminal }) {
  return (
    <div className="p-0 flex flex-col w-full h-full bg-[var(--ins-gutter)]">
      {titleBar}
      <div className="flex flex-1 min-h-0 gap-1.5 pl-2 pt-1.5 pb-1">
        {sidebar}
        <div className="flex-1 flex flex-row min-h-0 relative">
          <div className="flex-1 flex flex-col gap-1.5 min-h-0 min-w-0 relative overflow-hidden">
            {children}
            {textarea && (
              // The prompt grows upward over the terminal's last rows instead of
              // shrinking it: a row-count change sends SIGWINCH and the CLI
              // repaints its whole UI. useAutoGrow sets --grow-overlay.
              <div
                data-grow-overlay
                className="flex-shrink-0 relative z-10 bg-[var(--ins-gutter)] mt-[calc(var(--grow-overlay,0px)*-1)]"
              >
                {textarea}
              </div>
            )}
          </div>
          {secondaryTerminal}
        </div>
      </div>
      {/* Portals into the tab bar; renders nothing here */}
      {statusBar}
    </div>
  );
}
