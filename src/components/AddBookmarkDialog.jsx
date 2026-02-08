import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useBookmarks } from '../contexts/BookmarksContext';
import { basename } from '../utils/pathUtils';

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bookmark Current Directory</DialogTitle>
          <DialogDescription>
            Add a bookmark to quickly navigate to this directory later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="path" className="text-sm font-medium opacity-70">
              Path
            </label>
            <Input
              id="path"
              type="text"
              value={currentPath || ''}
              readOnly
              className="opacity-60 cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium opacity-70">
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
              <p className="text-xs text-red-400">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit">
              Add Bookmark
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
