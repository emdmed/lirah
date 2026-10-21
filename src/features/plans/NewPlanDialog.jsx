import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
import { Textarea } from '../../components/ui/textarea';
import { hash8 } from './PlansContext';

/** Paste a plan (or load one from any path) and hand it to the splitter. */
export function NewPlanDialog({ open, onOpenChange, onCreate }) {
  const [source, setSource] = useState('');
  const [path, setPath] = useState('');
  const [loadedFrom, setLoadedFrom] = useState(null); // { path, hash } when loaded from a file
  const [error, setError] = useState('');

  const close = () => {
    onOpenChange(false);
    setSource('');
    setPath('');
    setLoadedFrom(null);
    setError('');
  };

  const handleLoad = async () => {
    const p = path.trim().replace(/^~(?=\/)/, '');
    if (!p) return;
    try {
      const full = path.trim().startsWith('~/') ? `${await invoke('get_home_dir')}${p}` : p;
      const text = await invoke('read_file_content', { path: full });
      setSource(text);
      setLoadedFrom({ path: full, hash: hash8(text) });
      setError('');
    } catch (e) {
      setError(`Couldn't read that file: ${e?.message || e}`);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!source.trim()) {
      setError('Paste a plan first');
      return;
    }
    const importedFrom = loadedFrom && hash8(source) === loadedFrom.hash ? loadedFrom : null;
    onCreate({ source, importedFrom });
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription>
            An agent reads the plan (and the code, read-only) and splits it into small chunks you implement one
            commit at a time. Plans are kept in ~/.lirah/plans, not in the repo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Textarea
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setError('');
            }}
            placeholder="# My plan&#10;&#10;Paste the plan markdown here…"
            className="h-72 resize-none font-mono text-xs"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLoad();
                }
              }}
              placeholder="or load a file: /path/to/plan.md"
              className="h-8 text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={handleLoad} disabled={!path.trim()}>
              Load
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!source.trim()}>
              Split into chunks
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
