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
import { useFileGroups } from './FileGroupsContext';

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
          <DialogTitle>Save Context Set</DialogTitle>
          <DialogDescription>
            Save the files in the current context as a named set for this project. Load it later to replace or add to a prompt's context.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="files-count" className="text-sm font-medium opacity-70">
              Context
            </label>
            <div className="text-sm opacity-60">
              {files?.length || 0} file{files?.length !== 1 ? 's' : ''} attached
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="group-name" className="text-sm font-medium opacity-70">
              Set name
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
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!files?.length}>
              Save Set
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
