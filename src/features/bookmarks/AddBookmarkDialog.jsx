import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useBookmarks } from './BookmarksContext';
import { basename } from '../../utils/pathUtils';

export function AddBookmarkDialog({ open, onOpenChange, currentPath }) {
  const { addBookmark } = useBookmarks();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  // Auto-fill name with directory basename when dialog opens
  useEffect(() => {
    if (open && currentPath) {
      const dirName = basename(currentPath) || 'root';
      setName(dirName);
      setError('');
    }
  }, [open, currentPath]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }

    try {
      addBookmark(currentPath, name);
      onOpenChange(false);
      setName('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setName('');
    setError('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        escLabel="cancel"
        hints={[{ keys: ['↵'], label: 'star' }]}
      >
        <DialogHeader>
          <DialogTitle>Star project</DialogTitle>
          <DialogDescription className="text-xs">
            Starred projects are listed when Lirah starts and in the projects palette (Ctrl+P).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="ins-legend">
              Name
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              autoFocus
            />
            {error && (
              <p className="text-xs text-[var(--ins-fault)]">{error}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="path" className="ins-legend">
              Path
            </label>
            <Input
              id="path"
              type="text"
              value={currentPath || ''}
              readOnly
              className="text-muted-foreground cursor-default"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Star
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
