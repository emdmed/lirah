import { useEffect, useRef } from 'react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from './ui/sidebar';
import { Folder, File, FileX } from 'lucide-react';
import { isDimmedEntry } from './file-tree/utils/lsColors';

export function FlatViewMenu({ folders, currentPath, onFolderClick, cursorIndex = null, registerList }) {
  const menuRef = useRef(null);

  // Expose the rows to the keyboard cursor (see useRowCursor). Re-registering
  // only updates the list; unregistering is left to unmount, since a cleanup
  // here would reset the cursor whenever onFolderClick changes identity.
  useEffect(() => {
    if (!registerList) return;
    registerList({
      count: folders.length,
      activate: (i) => {
        const item = folders[i];
        if (item?.is_dir) onFolderClick(item.path);
      },
      scrollToIndex: (i) => {
        menuRef.current?.querySelector(`[data-nav-index="${i}"]`)?.scrollIntoView({ block: 'nearest' });
      },
    });
  }, [folders, onFolderClick, registerList]);

  useEffect(() => () => registerList?.(null), [registerList]);

  return (
    <SidebarMenu ref={menuRef}>
      {folders.length === 0 ? (
        <div className="p-1 opacity-50 text-[0.7rem]">
          No files or folders found
        </div>
      ) : (
        folders.map((item, i) => {
          const isCursor = i === cursorIndex || undefined;
          const isCurrentPath = item.path === currentPath;
          const isDeleted = item.is_deleted;
          const dimStyle = isDimmedEntry(item.name) ? { opacity: 0.45 } : undefined;

          if (item.is_dir) {
            return (
              <SidebarMenuItem key={item.path} className="relative my-0 p-0 w-full" style={dimStyle}>
                <SidebarMenuButton
                  size="sm"
                  onClick={() => onFolderClick(item.path)}
                  data-nav-row
                  data-nav-index={i}
                  data-cursor={isCursor}
                  data-nav-activate
                  className={`p-0 cursor-pointer h-5 focus-ring ${isCurrentPath ? 'bg-accent' : ''}`}
                >
                  <div className="flex items-center w-full">
                    <div className="w-3 flex items-center" /> {/* Chevron placeholder for alignment */}
                    <Folder className="w-3 h-3 ml-1 mr-1 text-muted-foreground" />
                    <span className="truncate font-semibold text-foreground" title={item.name}>{item.name}</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <SidebarMenuItem key={item.path} className="relative my-0 p-0 w-full" style={dimStyle}>
              <div data-nav-row data-nav-index={i} data-cursor={isCursor} className={`flex h-5 items-center justify-between w-full py-0 pr-px ${isCurrentPath ? 'bg-accent' : ''} ${isDeleted ? 'opacity-60' : ''}`}>
                <div className="w-5 flex items-center justify-center flex-shrink-0">
                  {isDeleted && <span className="text-git-deleted text-[11px] font-mono">D</span>}
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
