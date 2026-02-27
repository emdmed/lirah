import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';

export function AutoChangelogDialog({ open, onOpenChange, enabled, trigger, targetFile, cli, onSave }) {
  const [draftEnabled, setDraftEnabled] = useState(enabled);
  const [draftTrigger, setDraftTrigger] = useState(trigger);
  const [draftTarget, setDraftTarget] = useState(targetFile);
  const [draftCli, setDraftCli] = useState(cli || 'claude-code');

  useEffect(() => {
    if (open) {
      setDraftEnabled(enabled);
      setDraftTrigger(trigger);
      setDraftTarget(targetFile);
      setDraftCli(cli || 'claude-code');
    }
  }, [open, enabled, trigger, targetFile, cli]);

  const handleSave = () => {
    onSave({
      enabled: draftEnabled,
      trigger: draftTrigger,
      targetFile: draftTarget.trim() || 'CHANGELOG.md',
      cli: draftCli,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Auto Changelog</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="changelog-enabled"
              checked={draftEnabled}
              onCheckedChange={setDraftEnabled}
            />
            <label htmlFor="changelog-enabled" className="text-sm cursor-pointer">
              Enable auto changelog
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Trigger mode</label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="trigger"
                  checked={draftTrigger === 'commit'}
                  onChange={() => setDraftTrigger('commit')}
                  className="accent-primary"
                />
                On every commit
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="trigger"
                  checked={draftTrigger === 'merge'}
                  onChange={() => setDraftTrigger('merge')}
                  className="accent-primary"
                />
                On merge to main/master
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">CLI backend</label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="cli-backend"
                  checked={draftCli === 'claude-code'}
                  onChange={() => setDraftCli('claude-code')}
                  className="accent-primary"
                />
                Claude Code
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="cli-backend"
                  checked={draftCli === 'opencode'}
                  onChange={() => setDraftCli('opencode')}
                  className="accent-primary"
                />
                OpenCode
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="changelog-target" className="text-sm text-muted-foreground">
              Target file
            </label>
            <Input
              id="changelog-target"
              value={draftTarget}
              onChange={(e) => setDraftTarget(e.target.value)}
              placeholder="CHANGELOG.md"
              className="text-sm font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
