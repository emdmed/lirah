import { useState, useEffect, useCallback } from 'react';
import { basename } from '../utils/pathUtils';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogGroup,
  DialogEmpty,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useBookmarks } from '../features/bookmarks';
import { useConfirm } from '../features/dialogs/DialogProvider';
import { X } from 'lucide-react';

export function WorkspaceDialog({ open, onOpenChange, onCreateWorkspace, existingWorkspaces, onOpenWorkspace, onDeleteWorkspace }) {
  const [mode, setMode] = useState('list'); // 'list' | 'create'
  const [name, setName] = useState('');
  const [selectedProjects, setSelectedProjects] = useState([]);
  const { bookmarks } = useBookmarks();

  useEffect(() => {
    if (open) {
      setMode(existingWorkspaces?.length > 0 ? 'list' : 'create');
      setName('');
      setSelectedProjects([]);
    }
  }, [open, existingWorkspaces]);

  const toggleProject = (bookmark) => {
    setSelectedProjects(prev => {
      const exists = prev.find(p => p.path === bookmark.path);
      if (exists) return prev.filter(p => p.path !== bookmark.path);
      return [...prev, { name: bookmark.name, path: bookmark.path, description: '' }];
    });
  };

  const updateDescription = (path, description) => {
    setSelectedProjects(prev => prev.map(p => p.path === path ? { ...p, description } : p));
  };

  const handleCreate = async () => {
    if (!name.trim() || selectedProjects.length < 2) return;
    await onCreateWorkspace(name.trim(), selectedProjects);
    onOpenChange(false);
  };

  const confirm = useConfirm();
  // Deleting removes the workspace folder (its CLAUDE.md and links); the
  // linked projects themselves are untouched.
  const handleDelete = useCallback(async (ws) => {
    const ok = await confirm({
      title: `Delete workspace "${ws.name}"?`,
      description: `Its folder (${ws.path}) is removed, with its CLAUDE.md and anything else saved there. The ${ws.projects.length} linked project${ws.projects.length === 1 ? ' is' : 's are'} not touched.`,
      confirmLabel: 'Delete workspace',
      destructive: true,
    });
    if (ok) await onDeleteWorkspace(ws.path);
  }, [confirm, onDeleteWorkspace]);

  const handleOpen = async (ws) => {
    await onOpenWorkspace(ws.path);
    onOpenChange(false);
  };

  const listing = mode === 'list';
  const status = listing
    ? `${existingWorkspaces?.length || 0} workspace${existingWorkspaces?.length === 1 ? '' : 's'}`
    : `${selectedProjects.length} selected · min 2`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" status={status} escLabel={listing ? 'close' : 'cancel'}>
        <DialogTitle>{listing ? 'Workspaces' : 'New workspace'}</DialogTitle>
        <DialogDescription className="sr-only">
          {listing
            ? 'Open or delete a workspace that links several starred projects.'
            : 'Name a workspace and pick at least two starred projects to link into it.'}
        </DialogDescription>

        {listing ? (
          <>
            <div className="-mx-2 flex max-h-[300px] flex-col overflow-y-auto">
              {existingWorkspaces?.length === 0 ? (
                <DialogEmpty>No workspaces yet.</DialogEmpty>
              ) : (
                existingWorkspaces?.map(ws => (
                  <div
                    key={ws.id}
                    className="group flex items-center gap-3 px-2 py-1 font-mono hover:bg-foreground/5 transition-colors"
                  >
                    <button
                      onClick={() => handleOpen(ws)}
                      className="flex min-w-0 flex-1 items-baseline gap-3 text-left"
                    >
                      <span className="shrink-0 text-sm text-foreground">{ws.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {ws.projects.map(p => p.name).join(' · ')}
                      </span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(ws); }}
                      className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-[var(--ins-fault)] group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Delete workspace ${ws.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button size="sm" onClick={() => setMode('create')}>
                New workspace
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="workspace-name" className="ins-legend">Name</label>
                <Input
                  id="workspace-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="my-fullstack-app"
                  className="font-mono"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <DialogGroup label="Projects" />
                <div className="-mx-2 flex max-h-[200px] flex-col overflow-y-auto" role="group" aria-label="Projects">
                  {bookmarks.length === 0 ? (
                    <DialogEmpty>No starred projects. Star projects first, then link them here.</DialogEmpty>
                  ) : (
                    bookmarks.map(bookmark => {
                      const isSelected = selectedProjects.some(p => p.path === bookmark.path);
                      return (
                        <button
                          key={bookmark.id}
                          onClick={() => toggleProject(bookmark)}
                          aria-pressed={isSelected}
                          className={`flex items-center gap-2 py-1 pl-3.5 pr-2 text-left text-sm font-mono transition-colors ${
                            isSelected
                              ? 'ins-row-selected text-foreground'
                              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                          }`}
                        >
                          <span className="w-3 shrink-0 text-[var(--ins-lamp)]" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                          <span className="truncate">{bookmark.name}</span>
                          <span className="ml-auto truncate text-xs text-muted-foreground">{basename(bookmark.path)}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {selectedProjects.length >= 2 && (
                <div className="flex flex-col gap-2 text-xs font-mono">
                  <DialogGroup label="Descriptions" />
                  <span className="text-muted-foreground">Optional. Written into the workspace CLAUDE.md.</span>
                  {selectedProjects.map(p => (
                    <div key={p.path} className="flex items-center gap-2">
                      <label htmlFor={`ws-desc-${p.path}`} className="w-32 shrink-0 truncate text-muted-foreground">{p.name}/</label>
                      <Input
                        id={`ws-desc-${p.path}`}
                        type="text"
                        value={p.description}
                        onChange={e => updateDescription(p.path, e.target.value)}
                        placeholder="e.g. React frontend"
                        className="h-7 flex-1 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              {existingWorkspaces?.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setMode('list')}>
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!name.trim() || selectedProjects.length < 2}
              >
                Create & open
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
