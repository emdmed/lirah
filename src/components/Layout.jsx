export function Layout({ sidebar, children, statusBar, textarea }) {
  return (
    <div className="p-1 flex flex-col" style={{ width: '100%', height: '100%' }}>
      <div className="flex flex-1 min-h-0">
        {sidebar}
        <div className="flex-1 flex flex-col px-2 min-h-0">
          {children}
          {textarea && (
            <div className="flex-shrink-0">
              {textarea}
            </div>
          )}
        </div>
      </div>
      <div className="flex-shrink-0" style={{ height: '32px' }}>
        {statusBar}
      </div>
    </div>
  );
}
