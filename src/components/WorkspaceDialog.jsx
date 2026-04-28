import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { useBookmarks } from '../features/bookmarks';
import { FolderTree, Plus, X, Layers } from 'lucide-react';

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

  const handleOpen = async (ws) => {
    await onOpenWorkspace(ws.path);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="w-5 h-5" />
            {mode === 'list' ? 'Workspaces' : 'New Workspace'}
          </DialogTitle>
        </DialogHeader>

        {mode === 'list' ? (
          <>
            <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto border rounded-none p-2 border-sketch">
              {existingWorkspaces?.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm opacity-50">
                  No workspaces yet.
                </div>
              ) : (
                existingWorkspaces?.map(ws => (
                  <div
                    key={ws.id}
                    className="flex items-center justify-between px-4 py-2.5 font-mono rounded-sm hover:bg-foreground/5 transition-colors"
                  >
                    <button
                      onClick={() => handleOpen(ws)}
                      className="flex flex-col items-start gap-1 text-left flex-1"
                    >
                      <span className="font-medium flex items-center gap-2">
                        <Layers className="w-3 h-3 opacity-50" />
                        {ws.name}
                      </span>
                      <span className="text-xs opacity-50">
                        {ws.projects.map(p => p.name).join(', ')}
                      </span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteWorkspace(ws.path); }}
                      className="p-1 opacity-40 hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setMode('create')}>
                <Plus className="w-3 h-3 mr-1" /> New Workspace
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-mono opacity-70 mb-1 block">Workspace Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="my-fullstack-app"
                  className="w-full px-3 py-2 text-sm font-mono border border-sketch rounded-none bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-mono opacity-70 mb-1 block">
                  Select Projects ({selectedProjects.length} selected, min 2)
                </label>
                <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto border rounded-none p-2 border-sketch">
                  {bookmarks.length === 0 ? (
                    <div className="text-xs opacity-50 text-center py-4">
                      No bookmarks. Add projects as bookmarks first.
                    </div>
                  ) : (
                    bookmarks.map(bookmark => {
                      const isSelected = selectedProjects.some(p => p.path === bookmark.path);
                      return (
                        <button
                          key={bookmark.id}
                          onClick={() => toggleProject(bookmark)}
                          className={`flex items-center gap-2 px-3 py-2 text-left text-sm font-mono rounded-sm transition-colors ${
                            isSelected
                              ? 'bg-foreground/8 border-l-2 border-primary'
                              : 'hover:bg-foreground/5 border-l-2 border-transparent'
                          }`}
                        >
                          <span className={`w-3 h-3 border rounded-sm flex items-center justify-center text-[10px] ${isSelected ? 'bg-foreground text-background' : 'border-sketch'}`}>
                            {isSelected ? '✓' : ''}
                          </span>
                          <span className="truncate">{bookmark.name}</span>
                          <span className="text-xs opacity-40 truncate ml-auto">{bookmark.path.split('/').pop()}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {selectedProjects.length >= 2 && (
                <div className="text-xs font-mono border-t pt-2 flex flex-col gap-2">
                  <span className="opacity-50">Descriptions (optional, included in CLAUDE.md):</span>
                  {selectedProjects.map(p => (
                    <div key={p.path} className="flex items-center gap-2 ml-2">
                      <span className="opacity-50 shrink-0">{p.name}/</span>
                      <input
                        type="text"
                        value={p.description}
                        onChange={e => updateDescription(p.path, e.target.value)}
                        placeholder="e.g. React frontend"
                        className="flex-1 px-2 py-1 text-xs font-mono border border-sketch rounded-none bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
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
                Create & Open
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
