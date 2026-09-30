export function Layout({ sidebar, children, statusBar, textarea, titleBar, secondaryTerminal }) {
  return (
    <div className="p-0 flex flex-col w-full h-full">
      {titleBar}
      <div className="flex flex-1 min-h-0 gap-1 pl-1 pt-1 pb-1">
        {sidebar}
        <div className="flex-1 flex flex-row min-h-0 relative">
          <div className="flex-1 flex flex-col gap-1 min-h-0 min-w-0 relative overflow-hidden">
            {children}
            {textarea && (
              <div className="flex-shrink-0">
                {textarea}
              </div>
            )}
          </div>
          {secondaryTerminal}
        </div>
      </div>
      <div className="flex-shrink-0 h-8">
        {statusBar}
      </div>
    </div>
  );
}
