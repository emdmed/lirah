import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from './ui/sidebar';
import { Folder, File } from 'lucide-react';

export function FlatViewMenu({ folders, onFolderClick }) {
  return (
    <SidebarMenu>
      {folders.length === 0 ? (
        <div className="p-1 opacity-50 text-[0.7rem]">
          No files or folders found
        </div>
      ) : (
        folders.map((item) => (
          <SidebarMenuItem key={item.path}>
            <SidebarMenuButton
              onClick={item.is_dir ? () => onFolderClick(item.path) : undefined}
              className={`px-1 py-px text-xs ${item.is_dir ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {item.is_dir ? (
                <Folder className="w-3 h-3 mr-1.5 text-folder" />
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
