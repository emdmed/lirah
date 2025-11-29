export function Layout({ sidebar, children, statusBar }) {
  return (
    <div className="p-1 flex flex-col border" style={{ width: '100%', height: '100%' }}>
      <div className="flex flex-1 min-h-0">
        {sidebar}
        <div className="flex-1 flex flex-col overflow-auto px-2">
          {children}
        </div>
      </div>
      {statusBar}
    </div>
  );
}
