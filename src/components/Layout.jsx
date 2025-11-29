export function Layout({ sidebar, children, statusBar }) {
  return (
    <div className="p-1 flex flex-col border" style={{ width: '100%', height: '100%' }}>
      <div className="flex flex-1 min-h-0">
        {sidebar}
        <div className="flex-1 flex flex-col px-2">
          {children}
        </div>
      </div>
      <div className="flex-shrink-0" style={{ height: '32px' }}>
        {statusBar}
      </div>
    </div>
  );
}
