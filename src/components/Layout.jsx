export function Layout({ sidebar, children }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex' }}>
      {sidebar}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}
