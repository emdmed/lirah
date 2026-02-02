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
import { useFileGroups } from '../contexts/FileGroupsContext';

export function SaveFileGroupDialog({ open, onOpenChange, projectPath, files }) {
  const { addGroup } = useFileGroups();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setError('');
    }
  }, [open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }

    try {
      addGroup(name, projectPath, files);
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
          <DialogTitle>Save File Group</DialogTitle>
          <DialogDescription>
            Save the current file selection as a named group for quick reuse.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="files-count" className="text-sm font-medium opacity-70">
              Files
            </label>
            <div className="text-sm opacity-60">
              {files?.length || 0} file{files?.length !== 1 ? 's' : ''} selected
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="group-name" className="text-sm font-medium opacity-70">
              Group Name
            </label>
            <Input
              id="group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., persistence feature"
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
            <Button type="submit" disabled={!files?.length}>
              Save Group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
