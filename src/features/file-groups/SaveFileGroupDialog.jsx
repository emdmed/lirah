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
      <DialogContent
        size="sm"
        escLabel="cancel"
        status={`${files?.length || 0} file${files?.length !== 1 ? 's' : ''}`}
        hints={[{ keys: ['↵'], label: 'save' }]}
      >
        <DialogHeader>
          <DialogTitle>Save context set</DialogTitle>
          <DialogDescription className="text-xs">
            Save the files in the current context as a named set for this project. Load it later to replace or add to a prompt's context.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="group-name" className="ins-legend">
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
              <p className="text-xs text-[var(--ins-fault)]">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!files?.length}>
              Save set
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
