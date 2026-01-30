import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from './ui/sidebar';
import { Folder, File, FileX } from 'lucide-react';

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
          const isDeleted = item.is_deleted;

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
              <div className={`flex h-5 items-center justify-between w-full py-0 pr-px ${isCurrentPath ? 'bg-accent' : ''} ${isDeleted ? 'opacity-60' : ''}`}>
                <div className="w-5 flex items-center justify-center flex-shrink-0">
                  {isDeleted && <span className="text-git-deleted text-[0.65rem] font-mono">D</span>}
                </div>
                <div className="flex items-center justify-start min-w-0 gap-1 flex-1">
                  {isDeleted ? (
                    <FileX className="w-3 h-3 flex-shrink-0 text-git-deleted" />
                  ) : (
                    <File className="w-3 h-3 flex-shrink-0" />
                  )}
                  <span className={`truncate text-xs ${isDeleted ? 'line-through text-git-deleted' : ''}`}>{item.name}</span>
                </div>
              </div>
            </SidebarMenuItem>
          );
        })
      )}
    </SidebarMenu>
  );
}
