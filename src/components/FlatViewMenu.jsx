import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from './ui/sidebar';
import { Folder, File } from 'lucide-react';

export function FlatViewMenu({ folders, currentPath, onFolderClick }) {
  return (
    <SidebarMenu>
      {folders.length === 0 ? (
        <div className="p-1 opacity-50 text-[0.7rem]">
          No files or folders found
        </div>
      ) : (
        folders.map((item) => {
          const isCurrentPath = item.path === currentPath;

          if (item.is_dir) {
            return (
              <SidebarMenuItem key={item.path} className="relative my-0 p-0 w-full">
                <SidebarMenuButton
                  size="sm"
                  onClick={() => onFolderClick(item.path)}
                  className={`p-0 cursor-pointer h-5 focus-ring ${isCurrentPath ? 'bg-accent' : ''}`}
                >
                  <div className="flex items-center w-full">
                    <div className="w-3 flex items-center" /> {/* Chevron placeholder for alignment */}
                    <Folder className="w-3 h-3 ml-1 mr-1 text-folder" />
                    <span className="truncate" title={item.name}>{item.name}</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <SidebarMenuItem key={item.path} className="relative my-0 p-0 w-full">
              <div className={`flex h-5 items-center justify-between w-full py-0 pr-px ${isCurrentPath ? 'bg-accent' : ''}`}>
                <div className="w-5 flex items-center justify-center flex-shrink-0" /> {/* Git column placeholder */}
                <div className="flex items-center justify-start min-w-0 gap-1 flex-1">
                  <File className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate text-xs">{item.name}</span>
                </div>
              </div>
            </SidebarMenuItem>
          );
        })
      )}
    </SidebarMenu>
  );
}
