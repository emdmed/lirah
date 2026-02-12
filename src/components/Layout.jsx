export function Layout({ sidebar, children, statusBar, textarea, titleBar, secondaryTerminal }) {
  return (
    <div className="p-1 flex flex-col" style={{ width: '100%', height: '100%' }}>
      {titleBar}
      <div className="flex flex-1 min-h-0">
        {sidebar}
        <div className="flex-1 flex flex-row min-h-0 relative">
          <div className="flex-1 flex flex-col px-2 min-h-0 relative overflow-hidden">
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
      <div className="flex-shrink-0" style={{ height: '32px' }}>
        {statusBar}
      </div>
    </div>
  );
}
