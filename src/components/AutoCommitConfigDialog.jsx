import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';

export function AutoCommitConfigDialog({ open, onOpenChange, cli, customPrompt, onSave }) {
  const [draftCli, setDraftCli] = useState(cli);
  const [draftPrompt, setDraftPrompt] = useState(customPrompt);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setDraftCli(cli);
      setDraftPrompt(customPrompt);
      setShowSuccess(false);
    }
  }, [open, cli, customPrompt]);

  const handleSave = () => {
    onSave({ cli: draftCli, customPrompt: draftPrompt });
    setShowSuccess(true);
    setTimeout(() => {
      onOpenChange(false);
    }, 800);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !showSuccess) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Auto Commit Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {showSuccess && (
            <div className="flex items-center gap-2 text-primary bg-primary/10 border border-primary/30 rounded px-3 py-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium">Settings saved successfully!</span>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">CLI backend</label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="autocommit-cli"
                  checked={draftCli === 'claude-code'}
                  onChange={() => setDraftCli('claude-code')}
                  className="accent-primary"
                />
                Claude Code
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="autocommit-cli"
                  checked={draftCli === 'opencode'}
                  onChange={() => setDraftCli('opencode')}
                  className="accent-primary"
                />
                OpenCode
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Additional prompt instructions
            </label>
            <p className="text-xs text-muted-foreground/70">
              Appended to the default commit message generation prompt. Leave empty for default behavior.
            </p>
            <textarea
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              placeholder="e.g. Use imperative mood. Prefix with ticket number PROJ-123."
              className="w-full h-24 text-sm font-mono bg-background border border-border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={showSuccess}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
