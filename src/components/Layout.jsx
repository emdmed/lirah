export function Layout({ sidebar, children, statusBar, textarea, titleBar, secondaryTerminal }) {
  return (
    <div className="p-0 flex flex-col w-full h-full bg-[var(--ins-gutter)]">
      {titleBar}
      {/* One gutter everywhere: 12px between frames and at the window edge.
          Frames are inset 6px top and bottom (.tui-pane), so vertical
          spacing is 6px of padding plus that inset; the sidebar's resize
          handle is the 12px gap to its right. */}
      <div className="flex flex-1 min-h-0 pl-3 pt-1.5 pb-1.5">
        {sidebar}
        {/* min-w-0: without it this row's floor is xterm's canvas width, so a
            narrowing window can't shrink it — it overflows, FitAddon measures
            the overflow and drops a column or two per frame, and the terminal
            crawls to its new width instead of snapping. */}
        <div className="flex-1 flex flex-row gap-3 min-h-0 min-w-0 relative">
          <div className="flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden">
            {children}
            {textarea && (
              // The prompt grows upward over the terminal's last rows instead of
              // shrinking it: a row-count change sends SIGWINCH and the CLI
              // repaints its whole UI. useAutoGrow sets --grow-overlay.
              <div
                data-grow-overlay
                className="ins-pane-enter flex-shrink-0 relative z-10 bg-[var(--ins-gutter)] mt-[calc(var(--grow-overlay,0px)*-1)]"
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
