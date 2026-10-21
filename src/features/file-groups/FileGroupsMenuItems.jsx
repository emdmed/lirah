import { useCallback, useState } from 'react';
import { Pencil, Plus, RefreshCw, Replace, Save, Trash2 } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '../../components/ui/dropdown-menu';
import { useConfirm } from '../confirm/ConfirmContext';
import { useToast } from '../toast';
import { useFileGroups } from './FileGroupsContext';
import { useFileSelection } from './FileSelectionContext';

const ITEM = 'text-[11px] py-1.5 cursor-pointer';
const plural = (n) => `${n} file${n === 1 ? '' : 's'}`;

// Inline rename field. Keys are kept away from the menu so typing doesn't
// trigger typeahead or close it; Enter saves, Escape cancels.
function RenameField({ initialName, onSubmit, onCancel }) {
  const [name, setName] = useState(initialName);

  const handleKeyDown = useCallback((e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(name);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }, [name, onSubmit, onCancel]);

  return (
    <div className="px-1.5 py-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Context set name"
        className="ins-well w-full h-6 px-1.5 text-[11px] font-mono bg-transparent outline-none"
      />
      <div className="pt-1 text-[10px] text-muted-foreground">Enter to save · Esc to cancel</div>
    </div>
  );
}

// Context sets (saved, named context) for a project, plus "Save context as
// set…", rendered as items inside a host dropdown. Each set opens a submenu:
// replace or add to the current context, update it from the current
// context, rename, delete.
export function FileGroupsMenuItems({ projectPath, onLoadGroup, onSaveGroup, hasSelectedFiles }) {
  const { getGroupsForProject, removeGroup, updateGroup } = useFileGroups();
  const { filesForGroup } = useFileSelection();
  const confirm = useConfirm();
  const toast = useToast();
  const [renamingId, setRenamingId] = useState(null);

  const groups = getGroupsForProject(projectPath);
  const currentCount = filesForGroup.length;

  const handleUpdate = useCallback((group) => {
    try {
      updateGroup(group.id, { files: filesForGroup });
      toast.success(`Updated "${group.name}" · ${plural(filesForGroup.length)}`);
    } catch (err) {
      toast.error(err.message);
    }
  }, [updateGroup, filesForGroup, toast]);

  const handleRename = useCallback((group, name) => {
    try {
      if (name.trim() && name.trim() !== group.name) updateGroup(group.id, { name });
      setRenamingId(null);
    } catch (err) {
      toast.error(err.message);
    }
  }, [updateGroup, toast]);

  const cancelRename = useCallback(() => setRenamingId(null), []);

  const handleDelete = useCallback(async (group) => {
    const ok = await confirm({
      title: `Delete context set "${group.name}"?`,
      description: `The saved set of ${plural(group.files.length)} is removed. Your current context and the files themselves are untouched.`,
      confirmLabel: 'Delete set',
      destructive: true,
    });
    if (ok) removeGroup(group.id);
  }, [confirm, removeGroup]);

  return (
    <>
      <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground">
        Saved context for this project
      </DropdownMenuLabel>
      {groups.length === 0 ? (
        <DropdownMenuItem disabled className="text-[11px] text-muted-foreground">
          No context sets saved
        </DropdownMenuItem>
      ) : (
        groups.map((group) => (
          <DropdownMenuSub key={group.id} onOpenChange={(open) => { if (!open && renamingId === group.id) setRenamingId(null); }}>
            <DropdownMenuSubTrigger className="flex items-center justify-between text-[11px] py-1.5">
              <span className="truncate pr-2">{group.name}</span>
              <span className="ml-auto pr-1 tabular-nums text-muted-foreground">{group.files.length}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60 text-xs">
              {renamingId === group.id ? (
                <RenameField
                  initialName={group.name}
                  onSubmit={(name) => handleRename(group, name)}
                  onCancel={cancelRename}
                />
              ) : (
                <>
                  <DropdownMenuItem onClick={() => onLoadGroup(group, 'replace')} className={ITEM}>
                    <Replace className="h-3 w-3 mr-1.5" />
                    Replace context
                    <span className="ml-auto text-muted-foreground">{plural(group.files.length)}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onLoadGroup(group, 'add')} className={ITEM}>
                    <Plus className="h-3 w-3 mr-1.5" />
                    Add to context
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleUpdate(group)}
                    disabled={currentCount === 0}
                    className={ITEM}
                    title={`Overwrite this set with the ${plural(currentCount)} in the current context`}
                  >
                    <RefreshCw className="h-3 w-3 mr-1.5" />
                    <span className="truncate">Update «{group.name}» with current context</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setRenamingId(group.id); }}
                    className={ITEM}
                  >
                    <Pencil className="h-3 w-3 mr-1.5" />
                    Rename…
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDelete(group)} className={`${ITEM} text-destructive`}>
                    <Trash2 className="h-3 w-3 mr-1.5" />
                    Delete…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={onSaveGroup}
        disabled={!hasSelectedFiles}
        className={ITEM}
      >
        <Save className="h-3 w-3 mr-1.5" />
        Save context as set…
      </DropdownMenuItem>
    </>
  );
}
