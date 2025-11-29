import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from './ui/sidebar';
import { Folder, File } from 'lucide-react';

export function FlatViewMenu({ folders, onFolderClick }) {
  return (
    <SidebarMenu>
      {folders.length === 0 ? (
        <div style={{ padding: '0.25rem', opacity: 0.5, fontSize: '0.7rem' }}>
          No files or folders found
        </div>
      ) : (
        folders.map((item) => (
          <SidebarMenuItem key={item.path}>
            <SidebarMenuButton
              onClick={item.is_dir ? () => onFolderClick(item.path) : undefined}
              style={{
                cursor: item.is_dir ? 'pointer' : 'default',
                paddingLeft: '4px',
                paddingRight: '4px',
                paddingTop: '1px',
                paddingBottom: '1px',
                fontSize: '0.75rem',
              }}
            >
              {item.is_dir ? (
                <Folder className="w-3 h-3 mr-1.5" style={{ color: '#E6C384' }} />
              ) : (
                <File className="w-3 h-3 mr-1.5" />
              )}
              {item.name}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))
      )}
    </SidebarMenu>
  );
}
