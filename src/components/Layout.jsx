export function Layout({ sidebar, children }) {
  return (
    <div className="p-2 flex border" style={{ width: '100%', height: '100%' }}>
      {sidebar}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
