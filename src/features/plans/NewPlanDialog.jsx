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
import { Scanner } from '../../components/instrument/Scanner';
import { hash8 } from '../../lib/ids';

/**
 * Paste a plan (or load one from any path) and hand it to the splitter, or
 * send it straight to the tab's agent as a prompt. `sendBlocked` is why the
 * send is off (no agent running), or null.
 */
export function NewPlanDialog({ open, onOpenChange, onCreate, onSendPrompt, sendBlocked }) {
  const [source, setSource] = useState('');
  const [path, setPath] = useState('');
  const [loadedFrom, setLoadedFrom] = useState(null); // { path, hash } when loaded from a file
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

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
    if (sending) return;
    if (!source.trim()) {
      setError('Paste a plan first');
      return;
    }
    const importedFrom = loadedFrom && hash8(source) === loadedFrom.hash ? loadedFrom : null;
    onCreate({ source, importedFrom });
    close();
  };

  // Small tasks skip the split: the text goes to this tab's agent as is.
  const canSend = onSendPrompt && !sendBlocked && !sending && source.trim();
  const handleSendPrompt = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSendPrompt(source);
      close();
    } catch (e) {
      setError(`Couldn't send it: ${e?.message || e}`);
    } finally {
      setSending(false);
    }
  };

  // ^↵ sends, as in the prompt box; ^⇧↵ splits.
  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (e.shiftKey) handleSubmit(e);
    else handleSendPrompt();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent
        size="lg"
        escLabel="cancel"
        lamp={sending ? 'blink' : undefined}
        status={sending
          ? <span className="inline-flex items-center gap-1.5"><Scanner size="sm" />sending</span>
          : source.trim() ? `${source.split('\n').length} lines${loadedFrom ? ' · loaded' : ''}` : undefined}
        hints={onSendPrompt
          ? [{ keys: ['^', '↵'], label: 'send as prompt' }, { keys: ['^', '⇧', '↵'], label: 'split' }]
          : [{ keys: ['^', '⇧', '↵'], label: 'split' }]}
      >
        <DialogHeader>
          <DialogTitle>{onSendPrompt ? 'New plan or prompt' : 'New plan'}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Split a plan into small chunks you implement one commit at a time (an agent reads it and the code,
            read-only; plans are kept in ~/.lirah/plans). For a small task, send it to this tab&apos;s agent as a
            prompt.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex flex-col gap-3">
          <label htmlFor="new-plan-source" className="ins-legend">Plan</label>
          <Textarea
            id="new-plan-source"
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
              aria-label="Load a plan from a file path"
              className="h-8 text-xs"
            />
            <Button type="button" variant="ghost" size="sm" onClick={handleLoad} disabled={!path.trim()}>
              Load
            </Button>
          </div>
          {error && <p className="text-xs text-[var(--ins-fault)]" role="alert">{error}</p>}
          {!error && onSendPrompt && sendBlocked && source.trim() && (
            <p className="text-xs text-muted-foreground">Send as prompt is off: {sendBlocked}.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            {onSendPrompt && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSendPrompt}
                disabled={!canSend}
                title={sendBlocked || undefined}
              >
                Send as prompt
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!source.trim() || sending}>
              Split into chunks
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
