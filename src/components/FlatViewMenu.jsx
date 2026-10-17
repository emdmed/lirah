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
          empty folder
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
                  <div className="flex items-center gap-1.5 w-full text-xs">
                    <span className="w-3 shrink-0" /> {/* cursor column */}
                    <Folder className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-semibold text-foreground" title={item.name}>{item.name}</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <SidebarMenuItem key={item.path} className="relative my-0 p-0 w-full" style={dimStyle}>
              <div data-nav-row data-nav-index={i} data-cursor={isCursor} className={`flex h-5 items-center gap-1.5 w-full py-0 pr-px text-xs ${isCurrentPath ? 'bg-accent' : ''} ${isDeleted ? 'opacity-60' : ''}`}>
                <span className="w-3 shrink-0 text-center text-git-deleted text-[11px] font-mono">{isDeleted && 'D'}</span>
                <div className="flex items-center justify-start min-w-0 gap-1.5 flex-1">
                  {isDeleted ? (
                    <FileX className="w-3 h-3 flex-shrink-0 text-git-deleted" />
                  ) : (
                    <File className="w-3 h-3 flex-shrink-0" />
                  )}
                  <span className={`truncate ${isDeleted ? 'line-through text-git-deleted' : ''}`}>{item.name}</span>
                </div>
              </div>
            </SidebarMenuItem>
          );
        })
      )}
    </SidebarMenu>
  );
}
